#include "apiclient.h"
#include "config.h"
#include "database.h"
#include "paper.h"
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QNetworkRequest>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QUrl>
#include <QDebug>
#include <QTimer>

ApiClient::ApiClient(QObject *parent)
    : QObject(parent)
    , m_network(new QNetworkAccessManager(this))
    , m_stopBackground(false)
{
}

ApiClient::~ApiClient()
{
}

void ApiClient::extractFromUrl(const QString& url, int priority, const QString& tags, const QString& notes)
{
    int paperId = Database::addPaperFromUrl(url, priority, tags, notes);
    if (paperId == 0) {
        ExtractedPaper result;
        result.error = "Failed to create paper record";
        // extraction failed
        return;
    }

    Paper paper = Database::getPaper(paperId);
    if (paper.id == 0) {
        ExtractedPaper result;
        result.error = "Failed to fetch paper";
        // extraction failed
        return;
    }

    m_pendingQueue.append(paperId);
    processBackgroundQueue();
}

void ApiClient::generateSummary(int paperId)
{
    Paper paper = Database::getPaper(paperId);
    if (paper.id == 0 || paper.sourceUrl.isEmpty()) {
        // error"Paper not found");
        return;
    }

    m_pendingQueue.append(paperId);
    processBackgroundQueue();
}

void ApiClient::processBackgroundQueue()
{
    if (m_stopBackground || m_pendingQueue.isEmpty())
        return;

    int paperId = m_pendingQueue.takeFirst();
    Paper paper = Database::getPaper(paperId);
    if (paper.id == 0)
        return;

    QString taskType;
    QString userContent;

    if (!paper.summary.isEmpty() || paper.aiCategory.isEmpty()) {
        taskType = "classify";
        userContent = QString("URL: %1\n\nTitle: %2\n\nAbstract: %3")
            .arg(paper.sourceUrl)
            .arg(paper.title)
            .arg(paper.abstract);
    } else {
        taskType = "summary";
        userContent = QString("URL: %1\n\nTitle: %2\n\nAbstract: %3")
            .arg(paper.sourceUrl)
            .arg(paper.title)
            .arg(paper.abstract);
    }

    QString sourceType = paper.sourceType.isEmpty() ? QString("paper") : paper.sourceType;
    QString sourceTypeNames = "论文";
    if (sourceType == QLatin1String("wechat_article")) sourceTypeNames = "微信文章";
    else if (sourceType == QLatin1String("twitter_thread")) sourceTypeNames = "推文";
    else if (sourceType == QLatin1String("blog_post")) sourceTypeNames = "博客";
    else if (sourceType == QLatin1String("video")) sourceTypeNames = "视频";

    QString systemPrompt = QString(R"(
你是一个信息提取助手，专门从%1文本中提取关键信息。
请从以下信息中提取，按 JSON 格式输出：
- title: 完整标题
- authors: 作者，多人用逗号分隔
- abstract: 核心内容摘要，中文200-400字
- category: 内容方向分类
- tags: 3-6关键词，逗号分隔
- stars_suggest: 推荐程度1-5
IMPORTANT: 只输出 JSON，不要其他内容。
)").arg(sourceTypeNames);

    callLlm(systemPrompt, userContent, taskType, paperId);
}

void ApiClient::callLlm(const QString& systemPrompt, const QString& userContent, const QString& taskType, int paperId)
{
    QUrl url(Config::llmBaseUrl() + "/chat/completions");

    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");
    request.setRawHeader("Authorization", QString("Bearer %1").arg(Config::llmApiKey()).toUtf8());

    QVariantMap payload;
    payload["model"] = Config::llmModel();
    payload["max_tokens"] = 500;
    payload["temperature"] = 0.3;

    QJsonArray messages;
    QJsonObject systemMsg;
    systemMsg["role"] = "system";
    systemMsg["content"] = systemPrompt;
    messages.append(systemMsg);

    QJsonObject userMsg;
    userMsg["role"] = "user";
    userMsg["content"] = userContent;
    messages.append(userMsg);

    payload["messages"] = messages;

    QJsonObject obj = QJsonObject::fromVariantMap(payload);
    QJsonDocument doc(obj);
    QByteArray body = doc.toJson(QJsonDocument::Compact);

    QNetworkReply *reply = m_network->post(request, body);
    reply->setProperty("paperId", paperId);
    reply->setProperty("taskType", taskType);

    connect(reply, &QNetworkReply::finished, this, &ApiClient::onReplyFinished);
}

void ApiClient::onReplyFinished()
{
    QNetworkReply *reply = qobject_cast<QNetworkReply*>(sender());
    if (!reply)
        return;

    int paperId = reply->property("paperId").toInt();
    QString taskType = reply->property("taskType").toString();

    if (reply->error() != QNetworkReply::NoError) {
        qWarning() << "API request failed:" << reply->errorString();
        ExtractedPaper result;
        result.error = reply->errorString();
        // extraction success
        reply->deleteLater();
        return;
    }

    QByteArray data = reply->readAll();
    reply->deleteLater();

    QJsonDocument doc = QJsonDocument::fromJson(data);
    if (doc.isNull()) {
        // error"Invalid JSON response");
        return;
    }

    QJsonObject obj = doc.object();
    QString content;

    if (obj.contains("choices") && obj["choices"].isArray()) {
        QJsonArray choices = obj["choices"].toArray();
        if (!choices.isEmpty()) {
            QJsonObject first = choices[0].toObject();
            if (first.contains("message")) {
                QJsonObject msg = first["message"].toObject();
                content = msg["content"].toString();
            }
        }
    }

    if (content.isEmpty()) {
        // error"Empty response from API");
        return;
    }

    content = content.trimmed();
    int start = content.indexOf('{');
    int end = content.lastIndexOf('}');
    if (start >= 0 && end >= 0 && end > start) {
        content = content.mid(start, end - start + 1);
    }

    ExtractedPaper result;
    QJsonDocument paperDoc = QJsonDocument::fromJson(content.toUtf8());
    if (paperDoc.isObject()) {
        QJsonObject p = paperDoc.object();
        result.title = p["title"].toString();
        result.authors = p["authors"].toString();
        result.abstract = p["abstract"].toString();
        result.category = p["category"].toString();
        result.tags = p["tags"].toString();
        result.stars = p["stars_suggest"].toInt();
    }

    if (taskType == QLatin1String("classify") || taskType == QLatin1String("both")) {
        Paper paper = Database::getPaper(paperId);
        if (paper.id != 0 && (!result.category.isEmpty() || !result.tags.isEmpty() || result.stars > 0)) {
            paper.aiCategory = result.category;
            if (!result.tags.isEmpty())
                paper.tags = result.tags;
            if (result.stars > 0)
                paper.stars = result.stars;
            Database::updatePaper(paperId, paper);
        }
        // extraction success
    } else if (taskType == QLatin1String("summary")) {
        Paper paper = Database::getPaper(paperId);
        if (paper.id != 0) {
            paper.summary = result.abstract;
            paper.aiCategory = result.category;
            paper.stars = result.stars;
            Database::updatePaper(paperId, paper);
        }
        // summary complete(paperId, result.abstract);
    }

    if (!m_pendingQueue.isEmpty() && !m_stopBackground) {
        QTimer::singleShot(500, this, &ApiClient::processBackgroundQueue);
    }
}

QString ApiClient::parseJsonResponse(const QString& jsonStr, const QString& field)
{
    QJsonDocument doc = QJsonDocument::fromJson(jsonStr.toUtf8());
    if (doc.isObject()) {
        return doc.object()[field].toString();
    }
    return QString();
}

void ApiClient::stopBackground()
{
    m_stopBackground = true;
    m_pendingQueue.clear();
}