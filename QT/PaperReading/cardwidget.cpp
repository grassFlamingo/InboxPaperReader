#include "cardwidget.h"
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QFrame>
#include <QFont>
#include <QPalette>
#include <QIcon>

CardWidget::CardWidget(const Paper& paper, QWidget* parent)
    : QWidget(parent)
    , m_paper(paper)
{
    setCursor(Qt::PointingHandCursor);
    setMinimumHeight(140);
    setMaximumHeight(180);

    QVBoxLayout* mainLayout = new QVBoxLayout(this);
    mainLayout->setContentsMargins(8, 8, 8, 8);
    mainLayout->setSpacing(6);

    QFrame* cardFrame = new QFrame(this);
    cardFrame->setFrameShape(QFrame::StyledPanel);
    cardFrame->setFrameShadow(QFrame::Raised);
    cardFrame->setStyleSheet("QFrame { background-color: #2b2b2b; border-radius: 8px; border: 1px solid #404040; }");

    QVBoxLayout* cardLayout = new QVBoxLayout(cardFrame);
    cardLayout->setContentsMargins(12, 10, 12, 10);
    cardLayout->setSpacing(4);

    QHBoxLayout* topRow = new QHBoxLayout();
    topRow->setSpacing(8);

    QString sourceIcon = m_paper.sourceTypeIcon();
    QLabel* sourceLabel = new QLabel(sourceIcon + " " + m_paper.displaySource(), this);
    sourceLabel->setStyleSheet("color: #888; font-size: 11px;");

    QString statusText;
    QString statusColor;
    if (m_paper.status == "done") {
        statusText = "✅ 已读";
        statusColor = "#4caf50";
    } else if (m_paper.status == "reading") {
        statusText = "📖 阅读中";
        statusColor = "#ff9800";
    } else {
        statusText = "○ 未读";
        statusColor = "#2196f3";
    }
    QLabel* statusLabel = new QLabel(statusText, this);
    statusLabel->setStyleSheet(QString("color: %1; font-size: 11px;").arg(statusColor));
    statusLabel->setAlignment(Qt::AlignRight);

    topRow->addWidget(sourceLabel);
    topRow->addStretch();
    topRow->addWidget(statusLabel);

    QLabel* titleLabel = new QLabel(m_paper.title, this);
    titleLabel->setStyleSheet("color: #e0e0e0; font-size: 14px; font-weight: bold;");
    titleLabel->setWordWrap(true);
    titleLabel->setMaximumHeight(40);

    QString cat = m_paper.displayCategory();
    QLabel* catLabel = new QLabel(cat, this);
    if (!cat.isEmpty()) {
        catLabel->setStyleSheet("color: #9c27b0; font-size: 11px; background-color: #3a3a3a; padding: 2px 6px; border-radius: 3px;");
    } else {
        catLabel->setStyleSheet("color: #666; font-size: 11px;");
    }

    QHBoxLayout* catRow = new QHBoxLayout();
    catRow->setSpacing(6);
    catRow->addWidget(catLabel);

    if (!m_paper.arxivId.isEmpty()) {
        QLabel* arxivLabel = new QLabel(QString("📄 %1").arg(m_paper.arxivId), this);
        arxivLabel->setStyleSheet("color: #ff5722; font-size: 11px;");
        catRow->addWidget(arxivLabel);
    }

    catRow->addStretch();

    QString starsStr;
    for (int j = 0; j < 5; ++j)
        starsStr += (j < m_paper.stars) ? "★" : "☆";
    QLabel* starsLabel = new QLabel(starsStr, this);
    starsLabel->setStyleSheet("color: #ffc107; font-size: 12px;");
    catRow->addWidget(starsLabel);

    if (!m_paper.authors.isEmpty()) {
        QLabel* authorsLabel = new QLabel(m_paper.authors, this);
        authorsLabel->setStyleSheet("color: #888; font-size: 11px;");
        authorsLabel->setWordWrap(true);
        cardLayout->addWidget(authorsLabel);
    }

    cardLayout->addLayout(topRow);
    cardLayout->addWidget(titleLabel);
    cardLayout->addLayout(catRow);

    mainLayout->addWidget(cardFrame);

    updateStyle();
}

void CardWidget::mousePressEvent(QMouseEvent* event)
{
    if (event->button() == Qt::LeftButton) {
        if (event->type() == QEvent::MouseButtonDblClick) {
            doubleClicked(m_paper);
        } else {
            emit clicked(m_paper);
        }
    }
    QWidget::mousePressEvent(event);
}

void CardWidget::mouseDoubleClickEvent(QMouseEvent* event)
{
    if (event->button() == Qt::LeftButton) {
        emit doubleClicked(m_paper);
    }
    QWidget::mouseDoubleClickEvent(event);
}

void CardWidget::updateStyle()
{
    QString bgColor = "#2b2b2b";
    if (m_paper.status == "unread") {
        bgColor = "#2d2d3a";
    } else if (m_paper.status == "reading") {
        bgColor = "#2d3a2d";
    } else if (m_paper.status == "done") {
        bgColor = "#252525";
    }

    setStyleSheet(QString("QWidget { background-color: %1; }").arg(bgColor));
}