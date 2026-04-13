#include "database.h"
#include "paper.h"
#include "config.h"
#include <QSqlQuery>
#include <QSqlError>
#include <QSqlDatabase>
#include <QDebug>
#include <QFile>
#include <QDateTime>

static QSqlDatabase& getDb()
{
    static QSqlDatabase db = QSqlDatabase::addDatabase("QSQLITE");
    return db;
}

bool Database::open()
{
    QSqlDatabase& db = getDb();
    if (db.isOpen())
        return true;

    QString dbPath = Config::databasePath();
    if (!QFile::exists(dbPath)) {
        qWarning() << "Database file not found:" << dbPath;
        return false;
    }

    db.setDatabaseName(dbPath);
    if (!db.open()) {
        qWarning() << "Failed to open database:" << db.lastError().text();
        return false;
    }

    qDebug() << "Database opened:" << dbPath;
    return true;
}

void Database::close()
{
    QSqlDatabase db = getDb();
    if (db.isOpen())
        db.close();
}

bool Database::isOpen()
{
    return getDb().isOpen();
}

QList<Paper> Database::getPapers(const QString& category,
                                  const QString& status,
                                  const QString& sourceType,
                                  const QString& sort,
                                  const QString& search)
{
    QList<Paper> papers;

    if (!open())
        return papers;

    QString sql = "SELECT * FROM papers WHERE 1=1";
    QList<QVariant> params;

    if (!category.isEmpty() && category != QLatin1String("")) {
        sql += " AND (category = ? OR ai_category = ?)";
        params.append(category);
        params.append(category);
    }

    if (!status.isEmpty() && status != QLatin1String("")) {
        sql += " AND status = ?";
        params.append(status);
    }

    if (!sourceType.isEmpty() && sourceType != QLatin1String("")) {
        sql += " AND source_type = ?";
        params.append(sourceType);
    }

    if (!search.isEmpty() && search != QLatin1String("")) {
        sql += " AND (title LIKE ? OR authors LIKE ? OR abstract LIKE ? OR tags LIKE ?)";
        QString pattern = QString("%") + search + "%";
        params.append(pattern);
        params.append(pattern);
        params.append(pattern);
        params.append(pattern);
    }

    if (sort == QLatin1String("date"))
        sql += " ORDER BY created_at DESC";
    else if (sort == QLatin1String("title"))
        sql += " ORDER BY title ASC";
    else if (sort == QLatin1String("stars"))
        sql += " ORDER BY stars DESC, id ASC";
    else
        sql += " ORDER BY priority DESC, id ASC";

    QSqlQuery query;
    query.prepare(sql);
    int idx = 0;
    for (const QVariant& p : params)
        query.bindValue(idx++, p);

    if (!query.exec()) {
        qWarning() << "Query failed:" << query.lastError().text();
        return papers;
    }

    while (query.next()) {
        Paper p;
        p.id = query.value("id").toInt();
        p.title = query.value("title").toString();
        p.authors = query.value("authors").toString();
        p.abstract = query.value("abstract").toString();
        p.source = query.value("source").toString();
        p.sourceUrl = query.value("source_url").toString();
        p.arxivId = query.value("arxiv_id").toString();
        p.category = query.value("category").toString();
        p.aiCategory = query.value("ai_category").toString();
        p.priority = query.value("priority").toInt();
        p.status = query.value("status").toString();
        p.tags = query.value("tags").toString();
        p.notes = query.value("notes").toString();
        p.sourceType = query.value("source_type").toString();
        p.summary = query.value("summary").toString();
        p.stars = query.value("stars").toInt();
        p.userRating = query.value("user_rating").toInt();
        p.createdAt = query.value("created_at").toDateTime();
        p.updatedAt = query.value("updated_at").toDateTime();
        papers.append(p);
    }

    return papers;
}

Paper Database::getPaper(int id)
{
    Paper paper;
    paper.id = 0;

    if (!open())
        return paper;

    QSqlQuery query;
    query.prepare("SELECT * FROM papers WHERE id = ?");
    query.bindValue(0, id);

    if (query.exec() && query.next()) {
        paper.id = query.value("id").toInt();
        paper.title = query.value("title").toString();
        paper.authors = query.value("authors").toString();
        paper.abstract = query.value("abstract").toString();
        paper.source = query.value("source").toString();
        paper.sourceUrl = query.value("source_url").toString();
        paper.arxivId = query.value("arxiv_id").toString();
        paper.category = query.value("category").toString();
        paper.aiCategory = query.value("ai_category").toString();
        paper.priority = query.value("priority").toInt();
        paper.status = query.value("status").toString();
        paper.tags = query.value("tags").toString();
        paper.notes = query.value("notes").toString();
        paper.sourceType = query.value("source_type").toString();
        paper.summary = query.value("summary").toString();
        paper.stars = query.value("stars").toInt();
        paper.userRating = query.value("user_rating").toInt();
        paper.createdAt = query.value("created_at").toDateTime();
        paper.updatedAt = query.value("updated_at").toDateTime();
    }

    return paper;
}

int Database::addPaper(const Paper& paper)
{
    if (!open())
        return 0;

    QSqlQuery query;
    query.prepare(R"(
        INSERT INTO papers (title, authors, abstract, source, source_url, arxiv_id,
                         category, priority, status, tags, notes, source_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    )");

    query.bindValue(0, paper.title);
    query.bindValue(1, paper.authors);
    query.bindValue(2, paper.abstract);
    query.bindValue(3, paper.source);
    query.bindValue(4, paper.sourceUrl);
    query.bindValue(5, paper.arxivId);
    query.bindValue(6, paper.category.isEmpty() ? QString("其他") : paper.category);
    query.bindValue(7, paper.priority);
    query.bindValue(8, paper.status.isEmpty() ? QString("unread") : paper.status);
    query.bindValue(9, paper.tags);
    query.bindValue(10, paper.notes);
    query.bindValue(11, paper.sourceType.isEmpty() ? QString("paper") : paper.sourceType);

    if (!query.exec()) {
        qWarning() << "Insert failed:" << query.lastError().text();
        return 0;
    }

    return query.lastInsertId().toInt();
}

bool Database::updatePaper(int id, const Paper& paper)
{
    if (!open() || id == 0)
        return false;

    QSqlQuery query;
    query.prepare(R"(
        UPDATE papers SET
            title = ?, authors = ?, abstract = ?, source = ?, source_url = ?,
            arxiv_id = ?, category = ?, priority = ?, status = ?, tags = ?,
            notes = ?, source_type = ?, summary = ?, ai_category = ?, stars = ?,
            user_rating = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    )");

    query.bindValue(0, paper.title);
    query.bindValue(1, paper.authors);
    query.bindValue(2, paper.abstract);
    query.bindValue(3, paper.source);
    query.bindValue(4, paper.sourceUrl);
    query.bindValue(5, paper.arxivId);
    query.bindValue(6, paper.category);
    query.bindValue(7, paper.priority);
    query.bindValue(8, paper.status);
    query.bindValue(9, paper.tags);
    query.bindValue(10, paper.notes);
    query.bindValue(11, paper.sourceType);
    query.bindValue(12, paper.summary);
    query.bindValue(13, paper.aiCategory);
    query.bindValue(14, paper.stars);
    query.bindValue(15, paper.userRating);
    query.bindValue(16, id);

    if (!query.exec()) {
        qWarning() << "Update failed:" << query.lastError().text();
        return false;
    }

    return true;
}

bool Database::deletePaper(int id)
{
    if (!open() || id == 0)
        return false;

    QSqlQuery query;
    query.prepare("DELETE FROM papers WHERE id = ?");
    query.bindValue(0, id);

    if (!query.exec()) {
        qWarning() << "Delete failed:" << query.lastError().text();
        return false;
    }

    return true;
}

bool Database::updateStatus(int id, const QString& status)
{
    if (!open() || id == 0)
        return false;

    QSqlQuery query;
    query.prepare("UPDATE papers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    query.bindValue(0, status);
    query.bindValue(1, id);

    if (!query.exec()) {
        qWarning() << "Update status failed:" << query.lastError().text();
        return false;
    }

    return true;
}

bool Database::updateRating(int id, int rating)
{
    if (!open() || id == 0)
        return false;

    QSqlQuery query;
    query.prepare("UPDATE papers SET user_rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    query.bindValue(0, rating);
    query.bindValue(1, id);

    if (!query.exec()) {
        qWarning() << "Update rating failed:" << query.lastError().text();
        return false;
    }

    return true;
}

PaperStats Database::getStats()
{
    PaperStats stats = {0, 0, 0, 0};

    if (!open())
        return stats;

    QSqlQuery query;

    if (query.exec("SELECT COUNT(*) FROM papers"))
        if (query.next())
            stats.total = query.value(0).toInt();

    if (query.exec("SELECT COUNT(*) FROM papers WHERE status = 'unread'"))
        if (query.next())
            stats.unread = query.value(0).toInt();

    if (query.exec("SELECT COUNT(*) FROM papers WHERE status = 'reading'"))
        if (query.next())
            stats.reading = query.value(0).toInt();

    if (query.exec("SELECT COUNT(*) FROM papers WHERE status = 'done'"))
        if (query.next())
            stats.done = query.value(0).toInt();

    return stats;
}

QList<CategoryCount> Database::getCategories()
{
    QList<CategoryCount> categories;

    if (!open())
        return categories;

    QSqlQuery query;
    query.exec("SELECT category, COUNT(*) as count FROM papers GROUP BY category ORDER BY MIN(priority) DESC");

    while (query.next()) {
        CategoryCount cc;
        cc.category = query.value("category").toString();
        cc.count = query.value("count").toInt();
        categories.append(cc);
    }

    return categories;
}

int Database::addPaperFromUrl(const QString& url, int priority,
                             const QString& tags, const QString& notes)
{
    if (!open())
        return 0;

    QSqlQuery query;
    query.prepare(R"(
        INSERT INTO papers (source_url, priority, status, source_type, title, category)
        VALUES (?, ?, ?, 'paper', ?, '其他')
    )");

    query.bindValue(0, url);
    query.bindValue(1, priority > 0 ? priority : 3);
    query.bindValue(2, QString("unread"));
    query.bindValue(3, url);

    if (!query.exec()) {
        qWarning() << "Insert from URL failed:" << query.lastError().text();
        return 0;
    }

    return query.lastInsertId().toInt();
}