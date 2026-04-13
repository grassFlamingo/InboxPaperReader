#ifndef PAPER_H
#define PAPER_H

#include <QString>
#include <QDateTime>

class Paper
{
public:
    int id;
    QString title;
    QString authors;
    QString abstract;
    QString source;
    QString sourceUrl;
    QString arxivId;
    QString category;
    QString aiCategory;
    int priority;
    QString status;
    QString tags;
    QString notes;
    QString sourceType;
    QString summary;
    int stars;
    int userRating;
    QDateTime createdAt;
    QDateTime updatedAt;

    Paper();

    QString displayCategory() const;
    QString displaySource() const;
    QString pdfUrl() const;
    QString statusIcon() const;
    QString sourceTypeIcon() const;

    static QString nextStatus(const QString& current);
    static QString statusLabel(const QString& current);
};

#endif