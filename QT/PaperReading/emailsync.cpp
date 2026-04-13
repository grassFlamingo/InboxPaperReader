#include "emailsync.h"
#include "config.h"
#include "database.h"
#include "paper.h"
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QUrl>
#include <QRegularExpression>
#include <QDebug>
#include <QTimer>

EmailSync::EmailSync(QObject *parent)
    : QObject(parent)
{
    m_status.running = false;
    m_status.emailsProcessed = 0;
    m_status.papersImported = 0;
}

EmailSync::~EmailSync()
{
}

void EmailSync::sync()
{
    if (m_status.running)
        return;

    if (!Config::emailEnabled()) {
        return;
    }

    m_status.running = true;
    m_status.errors.clear();
    m_status.emailsProcessed = 0;
    m_status.papersImported = 0;

    QTimer::singleShot(100, this, &EmailSync::onSyncFinished);
}

void EmailSync::onSyncFinished()
{
    m_status.running = false;
    m_status.lastRun = QDateTime::currentDateTime();
    m_status.emailsProcessed = 0;
    m_status.papersImported = 0;
}

SyncStatus EmailSync::getStatus() const
{
    return m_status;
}

void EmailSync::stop()
{
    m_status.running = false;
}

QList<QString> EmailSync::extractArxivIds(const QString& html, const QString& text)
{
    QSet<QString> ids;
    QRegularExpression re1("arxiv\\.org/abs/(\\d{4}\\.\\d{4,5})", QRegularExpression::CaseInsensitiveOption);
    QRegularExpression re2("arxiv\\.org/pdf/(\\d{4}\\.\\d{4,5})", QRegularExpression::CaseInsensitiveOption);
    QRegularExpression re3("(\\d{4}\\.\\d{4,5})");

    QString content = html + " " + text;

    auto matchIterator1 = re1.globalMatch(content);
    while (matchIterator1.hasNext()) {
        QString id = matchIterator1.next().captured(1);
        if (id.contains(QRegularExpression("^\\d{4}\\.\\d{4,5}$")))
            ids.insert(id);
    }

    auto matchIterator2 = re2.globalMatch(content);
    while (matchIterator2.hasNext()) {
        QString id = matchIterator2.next().captured(1);
        if (id.contains(QRegularExpression("^\\d{4}\\.\\d{4,5}$")))
            ids.insert(id);
    }

    auto matchIterator3 = re3.globalMatch(content);
    while (matchIterator3.hasNext()) {
        QString id = matchIterator3.next().captured(1);
        if (id.contains(QRegularExpression("^\\d{4}\\.\\d{4,5}$")))
            ids.insert(id);
    }

    return ids.values().toList();
}

ArxivIdResult EmailSync::fetchArxivMetadata(const QString& arxivId)
{
    ArxivIdResult result;
    result.arxivId = arxivId;

    if (arxivId.isEmpty())
        return result;

    QNetworkAccessManager manager;
    QUrl url(QString("http://export.arxiv.org/api/query?id_list=%1").arg(arxivId));

    QNetworkRequest request(url);
    request.setHeader(QNetworkRequest::UserAgentHeader, "PaperReading/1.0");

    QNetworkReply *reply = manager.get(request);
    QEventLoop loop;
    QObject::connect(reply, &QNetworkReply::finished, &loop, &QEventLoop::quit);
    loop.exec();

    if (reply->error() != QNetworkReply::NoError) {
        qWarning() << "arXiv fetch error:" << reply->errorString();
        reply->deleteLater();
        return result;
    }

    QString xml = QString::fromUtf8(reply->readAll());
    reply->deleteLater();

    QRegularExpression titleRe("<title>([^<]+)</title>", QRegularExpression::CaseInsensitiveOption);
    QRegularExpression summaryRe("<summary>([^<]+)</summary>", QRegularExpression::CaseInsensitiveOption);
    QRegularExpression authorRe("<author><name>([^<]+)</name></author>", QRegularExpression::CaseInsensitiveOption);

    auto titleMatch = titleRe.match(xml);
    if (titleMatch.hasMatch()) {
        result.title = titleMatch.captured(1).trimmed();
        result.title.replace(QRegularExpression("\\s+"), " ");
    }

    auto summaryMatch = summaryRe.match(xml);
    if (summaryMatch.hasMatch()) {
        result.abstract = summaryMatch.captured(1).trimmed();
        result.abstract.replace(QRegularExpression("\\s+"), " ");
    }

    QStringList authors;
    auto authorMatchIterator = authorRe.globalMatch(xml);
    while (authorMatchIterator.hasNext()) {
        authors.append(authorMatchIterator.next().captured(1).trimmed());
    }
    result.authors = authors.join(", ");

    result.source = "arXiv";
    result.sourceUrl = QString("https://arxiv.org/abs/%1").arg(arxivId);
    result.pdfUrl = QString("https://arxiv.org/pdf/%1").arg(arxivId);

    return result;
}