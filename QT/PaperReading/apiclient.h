#ifndef APICLIENT_H
#define APICLIENT_H

#include <QString>
#include <QObject>
#include <QList>
#include <QNetworkAccessManager>
#include <QNetworkReply>

struct ExtractedPaper {
    QString title;
    QString authors;
    QString abstract;
    QString category;
    QString tags;
    int stars;
    QString sourceType;
    QString error;
};

class ApiClient : public QObject
{
    Q_OBJECT
public:
    explicit ApiClient(QObject *parent = nullptr);
    ~ApiClient();

    void extractFromUrl(const QString& url, int priority, const QString& tags, const QString& notes);
    void generateSummary(int paperId);
    void processBackgroundQueue();
    void stopBackground();

private:
    void callLlm(const QString& systemPrompt, const QString& userContent, const QString& taskType, int paperId = 0);
    void onReplyFinished();
    QString parseJsonResponse(const QString& jsonStr, const QString& field);

    QNetworkAccessManager *m_network;
    bool m_stopBackground;
    QList<int> m_pendingQueue;
};

#endif