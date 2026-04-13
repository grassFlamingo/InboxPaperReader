#include "paper.h"

Paper::Paper()
    : id(0), priority(3), stars(0), userRating(0)
{
}

QString Paper::displayCategory() const
{
    if (!aiCategory.isEmpty())
        return aiCategory;
    return category.isEmpty() ? QString("其他") : category;
}

QString Paper::displaySource() const
{
    return source.isEmpty() ? QString("arXiv") : source;
}

QString Paper::pdfUrl() const
{
    if (!arxivId.isEmpty())
        return QString("https://arxiv.org/pdf/") + arxivId;
    return sourceUrl;
}

QString Paper::statusIcon() const
{
    if (status == QLatin1String("done"))
        return QString("✅");
    if (status == QLatin1String("reading"))
        return QString("📖");
    return QString();
}

QString Paper::sourceTypeIcon() const
{
    if (sourceType == QLatin1String("paper"))
        return QString("📄");
    if (sourceType == QLatin1String("wechat_article"))
        return QString("💬");
    if (sourceType == QLatin1String("twitter_thread"))
        return QString("🐦");
    if (sourceType == QLatin1String("blog_post"))
        return QString("📝");
    if (sourceType == QLatin1String("video"))
        return QString("🎬");
    return QString("🔗");
}

QString Paper::nextStatus(const QString& current)
{
    if (current == QLatin1String("unread"))
        return QString("reading");
    if (current == QLatin1String("reading"))
        return QString("done");
    return QString("unread");
}

QString Paper::statusLabel(const QString& current)
{
    if (current == QLatin1String("unread"))
        return QString("标记阅读中");
    if (current == QLatin1String("reading"))
        return QString("标记已读");
    return QString("重置未读");
}