#ifndef DATABASE_H
#define DATABASE_H

#include <QString>
#include <QStringList>
#include <QList>
#include <QSqlDatabase>

class Paper;

struct PaperStats {
    int total;
    int unread;
    int reading;
    int done;
};

struct CategoryCount {
    QString category;
    int count;
};

class Database
{
public:
    static bool open();
    static void close();
    static bool isOpen();

    static QList<Paper> getPapers(const QString& category = QString(),
                                const QString& status = QString(),
                                const QString& sourceType = QString(),
                                const QString& sort = QString("priority"),
                                const QString& search = QString());
    static Paper getPaper(int id);
    static int addPaper(const Paper& paper);
    static bool updatePaper(int id, const Paper& paper);
    static bool deletePaper(int id);
    static bool updateStatus(int id, const QString& status);
    static bool updateRating(int id, int rating);

    static PaperStats getStats();
    static QList<CategoryCount> getCategories();

    static int addPaperFromUrl(const QString& url, int priority,
                             const QString& tags, const QString& notes);
};

#endif