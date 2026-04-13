#ifndef EMAILSYNC_H
#define EMAILSYNC_H

#include <QString>
#include <QObject>
#include <QList>
#include <QDateTime>

struct SyncStatus {
    bool running;
    QDateTime lastRun;
    int emailsProcessed;
    int papersImported;
    QStringList errors;
};

struct ArxivIdResult {
    QString arxivId;
    QString title;
    QString authors;
    QString abstract;
    QString source;
    QString sourceUrl;
    QString pdfUrl;
};

class EmailSync : public QObject
{
    Q_OBJECT
public:
    explicit EmailSync(QObject *parent = nullptr);
    ~EmailSync();

    void sync();
    SyncStatus getStatus() const;
    void stop();

private:
    void onSyncFinished();
    QList<QString> extractArxivIds(const QString& html, const QString& text);
    ArxivIdResult fetchArxivMetadata(const QString& arxivId);

    SyncStatus m_status;
};

#endif