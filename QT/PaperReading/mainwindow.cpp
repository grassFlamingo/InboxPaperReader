#include "mainwindow.h"
#include "./ui_mainwindow.h"
#include "paper.h"
#include "database.h"
#include "config.h"
#include "apiclient.h"
#include "emailsync.h"
#include "cardwidget.h"

#include <QScrollArea>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QLineEdit>
#include <QComboBox>
#include <QLabel>
#include <QPushButton>
#include <QListWidget>
#include <QInputDialog>
#include <QMessageBox>
#include <QDialog>
#include <QTextEdit>
#include <QDialogButtonBox>
#include <QMenu>
#include <QAction>
#include <QDesktopServices>
#include <QUrl>
#include <QStatusBar>
#include <QToolBar>
#include <QFileDialog>
#include <QSpinBox>
#include <QTimer>
#include <QFrame>
#include <QLayout>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
    , m_apiClient(new ApiClient(this))
    , m_emailSync(new EmailSync(this))
    , m_editId(0)
    , m_gridMode(false)
    , m_searchBox(nullptr)
    , m_statsLabel(nullptr)
    , m_cardsContainer(nullptr)
    , m_cardsLayout(nullptr)
    , m_cardsScrollArea(nullptr)
{
    ui->setupUi(this);

    setWindowTitle("论文待读列表");
    resize(1200, 800);

    QWidget* central = centralWidget();
    QVBoxLayout* mainLayout = qobject_cast<QVBoxLayout*>(central->layout());
    if (mainLayout) {
        m_cardsScrollArea = new QScrollArea(central);
        m_cardsScrollArea->setObjectName("cardsScrollArea");
        m_cardsScrollArea->setWidgetResizable(true);
        m_cardsScrollArea->setAlignment(Qt::AlignHCenter);

        m_cardsContainer = new QWidget(m_cardsScrollArea);
        m_cardsContainer->setObjectName("cardsContainer");
        m_cardsLayout = new QVBoxLayout(m_cardsContainer);
        m_cardsLayout->setSpacing(12);
        m_cardsLayout->setContentsMargins(20, 20, 20, 20);

        m_cardsLayout->addStretch();

        m_cardsScrollArea->setWidget(m_cardsContainer);

        delete mainLayout->takeAt(0);
        mainLayout->addWidget(m_cardsScrollArea);
    }

    QToolBar* mainToolbar = addToolBar("工具栏");
    mainToolbar->setMovable(false);
    mainToolbar->addAction("+ 添加论文", this, SLOT(onAddPaper()));
    mainToolbar->addAction("导入URL", this, SLOT(onImportUrl()));
    mainToolbar->addAction("同步邮箱", this, SLOT(onSyncEmails()));
    mainToolbar->addAction("⟳ 刷新", this, SLOT(onRefresh()));

    QWidget* spacer = new QWidget(mainToolbar);
    spacer->setSizePolicy(QSizePolicy::Expanding, QSizePolicy::Preferred);
    mainToolbar->addWidget(spacer);

    QLabel* catLabel = new QLabel("分类:", mainToolbar);
    mainToolbar->addWidget(catLabel);
    QComboBox* catCombo = new QComboBox(mainToolbar);
    catCombo->setObjectName("filterCat");
    catCombo->setMinimumWidth(120);
    mainToolbar->addWidget(catCombo);

    QLabel* statusLabel = new QLabel("状态:", mainToolbar);
    mainToolbar->addWidget(statusLabel);
    QComboBox* statusCombo = new QComboBox(mainToolbar);
    statusCombo->setObjectName("filterStatus");
    statusCombo->addItems(QStringList() << "全部状态" << "未读" << "阅读中" << "已读");
    statusCombo->setMinimumWidth(100);
    mainToolbar->addWidget(statusCombo);

    QLabel* sourceLabel = new QLabel("来源:", mainToolbar);
    mainToolbar->addWidget(sourceLabel);
    QComboBox* sourceCombo = new QComboBox(mainToolbar);
    sourceCombo->setObjectName("filterSourceType");
    sourceCombo->addItems(QStringList() << "全部来源" << "论文" << "微信文章" << "推文" << "博客" << "视频");
    sourceCombo->setMinimumWidth(100);
    mainToolbar->addWidget(sourceCombo);

    m_searchBox = new QLineEdit(mainToolbar);
    m_searchBox->setObjectName("searchBox");
    m_searchBox->setPlaceholderText("搜索标题/作者/标签...");
    m_searchBox->setMaximumWidth(250);
    mainToolbar->addWidget(m_searchBox);

    connect(m_searchBox, SIGNAL(returnPressed()), SLOT(onSearchChanged()));

    connect(catCombo, SIGNAL(currentIndexChanged(int)), SLOT(onFilterChanged()));
    connect(statusCombo, SIGNAL(currentIndexChanged(int)), SLOT(onFilterChanged()));
    connect(sourceCombo, SIGNAL(currentIndexChanged(int)), SLOT(onFilterChanged()));

    Database::open();
    loadPapers();
    loadCategories();
    updateStats();

    statusBar()->showMessage("就绪", 3000);
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::loadPapers()
{
    QString category = m_currentFilterCategory;
    QString status = m_currentFilterStatus;
    QString sourceType = m_currentFilterSourceType;
    QString sort = m_currentSort;
    QString search = m_searchBox ? m_searchBox->text() : QString();

    m_papers = Database::getPapers(category, status, sourceType, sort, search);

    updateCards();
}

void MainWindow::loadCategories()
{
    m_categories = Database::getCategories();

    QComboBox* catCombo = findChild<QComboBox*>("filterCat");
    if (catCombo) {
        catCombo->blockSignals(true);
        catCombo->clear();
        catCombo->addItem("全部分类", "");
        for (int i = 0; i < m_categories.size(); ++i) {
            const CategoryCount& cc = m_categories[i];
            catCombo->addItem(QString("%1 (%2)").arg(cc.category).arg(cc.count), cc.category);
        }
        catCombo->blockSignals(false);
    }
}

void MainWindow::updateStats()
{
    PaperStats s = Database::getStats();

    if (m_statsLabel) {
        m_statsLabel->setText(QString("总计: %1  |  未读: %2  |  阅读中: %3  |  已读: %4")
                         .arg(s.total).arg(s.unread).arg(s.reading).arg(s.done));
    }

    QString statsText = QString("总计: %1  |  未读: %2  |  阅读中: %3  |  已读: %4")
                       .arg(s.total).arg(s.unread).arg(s.reading).arg(s.done);
    statusBar()->showMessage(statsText, 5000);
}

void MainWindow::updateCards()
{
    for (CardWidget* card : m_cardWidgets) {
        m_cardsLayout->removeWidget(card);
        delete card;
    }
    m_cardWidgets.clear();

    int insertIndex = m_cardsLayout->count() - 1;

    for (const Paper& p : m_papers) {
        CardWidget* card = new CardWidget(p, m_cardsContainer);
        m_cardWidgets.append(card);

        connect(card, &CardWidget::clicked, this, &MainWindow::onCardClicked);
        connect(card, &CardWidget::doubleClicked, this, &MainWindow::onCardDoubleClicked);
        connect(card, &CardWidget::statusChanged, this, &MainWindow::onCardStatusChanged);
        connect(card, &CardWidget::ratingChanged, this, &MainWindow::onCardRatingChanged);
        connect(card, &CardWidget::deleteRequested, this, &MainWindow::onCardDeleteRequested);

        m_cardsLayout->insertWidget(insertIndex++, card);
    }
}

void MainWindow::onAddPaper()
{
    m_editId = 0;
    showPaperDialog(nullptr);
}

void MainWindow::onImportUrl()
{
    bool ok;
    QString url = QInputDialog::getText(this, "导入URL", "URL:", QLineEdit::Normal, QString(), &ok);
    if (!ok || url.isEmpty())
        return;

    if (!url.startsWith("http://") && !url.startsWith("https://"))
        url = "https://" + url;

    if (!m_apiClient) {
        showStatusMessage("API 客户端未初始化", 3000);
        return;
    }

    showStatusMessage("正在导入...", 0);
    m_apiClient->extractFromUrl(url, 3, QString(), QString());
}

void MainWindow::onSyncEmails()
{
    if (!m_emailSync) {
        showStatusMessage("Email 客户端未初始化", 3000);
        return;
    }

    showStatusMessage("正在同步邮箱...", 0);
    m_emailSync->sync();
}

void MainWindow::onSearchChanged()
{
    m_searchText = m_searchBox ? m_searchBox->text() : QString();
    loadPapers();
}

void MainWindow::onFilterChanged()
{
    QComboBox* catCombo = findChild<QComboBox*>("filterCat");
    QComboBox* statusCombo = findChild<QComboBox*>("filterStatus");
    QComboBox* sourceCombo = findChild<QComboBox*>("filterSourceType");

    m_currentFilterCategory = catCombo ? catCombo->currentData().toString() : QString();
    
    QString statusText = statusCombo ? statusCombo->currentText() : QString();
    if (statusText == "未读") m_currentFilterStatus = "unread";
    else if (statusText == "阅读中") m_currentFilterStatus = "reading";
    else if (statusText == "已读") m_currentFilterStatus = "done";
    else m_currentFilterStatus = "";

    QString sourceText = sourceCombo ? sourceCombo->currentText() : QString();
    if (sourceText == "论文") m_currentFilterSourceType = "paper";
    else if (sourceText == "微信文章") m_currentFilterSourceType = "wechat_article";
    else if (sourceText == "推文") m_currentFilterSourceType = "twitter_thread";
    else if (sourceText == "博客") m_currentFilterSourceType = "blog_post";
    else if (sourceText == "视频") m_currentFilterSourceType = "video";
    else m_currentFilterSourceType = "";

    loadPapers();
}

void MainWindow::onSortChanged()
{
    QComboBox* sortCombo = findChild<QComboBox*>("sortBy");
    m_currentSort = sortCombo ? sortCombo->currentData().toString() : "priority";
    loadPapers();
}

void MainWindow::onLayoutChanged()
{
    m_gridMode = !m_gridMode;
    loadPapers();
}

void MainWindow::onCardClicked(const Paper& paper)
{
    showPaperDialog(&paper);
}

void MainWindow::onCardDoubleClicked(const Paper& paper)
{
    Paper p = paper;
    if (p.status == "unread") {
        Database::updateStatus(p.id, "reading");
        loadPapers();
    }

    openPaperUrl(p);
}

void MainWindow::onCardStatusChanged(const Paper& paper)
{
    QString next = Paper::nextStatus(paper.status);
    Database::updateStatus(paper.id, next);
    loadPapers();
    updateStats();
}

void MainWindow::onCardRatingChanged(const Paper& paper, int rating)
{
    Database::updateRating(paper.id, rating);
    loadPapers();
}

void MainWindow::onCardDeleteRequested(const Paper& paper)
{
    if (QMessageBox::warning(this, "删除论文",
                         "确定删除这篇论文？",
                         QMessageBox::Yes | QMessageBox::No) != QMessageBox::Yes)
        return;

    Database::deletePaper(paper.id);
    loadPapers();
    loadCategories();
    updateStats();
    showStatusMessage("已删除", 2000);
}

void MainWindow::onRefresh()
{
    loadPapers();
    loadCategories();
    updateStats();
    showStatusMessage("已刷新", 2000);
}

void MainWindow::onEditPaper(const Paper& paper)
{
    m_editId = paper.id;
    showPaperDialog(&paper);
}

void MainWindow::onDeletePaper(const Paper& paper)
{
    onCardDeleteRequested(paper);
}

void MainWindow::onCycleStatus(const Paper& paper)
{
    QString next = Paper::nextStatus(paper.status);
    Database::updateStatus(paper.id, next);
    loadPapers();
    updateStats();
}

void MainWindow::showPaperDialog(const Paper* paper)
{
    QDialog dialog(this);
    dialog.setWindowTitle(paper ? "编辑论文" : "添加论文");
    dialog.resize(500, 600);

    QGridLayout* layout = new QGridLayout(&dialog);

    QLineEdit* titleEdit = new QLineEdit(&dialog);
    QLineEdit* authorsEdit = new QLineEdit(&dialog);
    QLineEdit* urlEdit = new QLineEdit(&dialog);
    QLineEdit* arxivEdit = new QLineEdit(&dialog);
    QComboBox* sourceCombo = new QComboBox(&dialog);
    QComboBox* sourceTypeCombo = new QComboBox(&dialog);
    QComboBox* categoryCombo = new QComboBox(&dialog);
    QSpinBox* prioritySpin = new QSpinBox(&dialog);
    QLineEdit* tagsEdit = new QLineEdit(&dialog);
    QTextEdit* abstractEdit = new QTextEdit(&dialog);

    sourceCombo->addItems(Config::sources());
    sourceTypeCombo->addItems(Config::sourceTypes());
    categoryCombo->addItems(Config::aiCategories());
    prioritySpin->setRange(1, 5);
    prioritySpin->setValue(3);

    int row = 0;
    layout->addWidget(new QLabel("标题:*"), row, 0);
    layout->addWidget(titleEdit, row++, 1);
    layout->addWidget(new QLabel("作者:"), row, 0);
    layout->addWidget(authorsEdit, row++, 1);
    layout->addWidget(new QLabel("来源:"), row, 0);
    layout->addWidget(sourceCombo, row++, 1);
    layout->addWidget(new QLabel("类型:"), row, 0);
    layout->addWidget(sourceTypeCombo, row++, 1);
    layout->addWidget(new QLabel("链接:"), row, 0);
    layout->addWidget(urlEdit, row++, 1);
    layout->addWidget(new QLabel("arXiv ID:"), row, 0);
    layout->addWidget(arxivEdit, row++, 1);
    layout->addWidget(new QLabel("分类:"), row, 0);
    layout->addWidget(categoryCombo, row++, 1);
    layout->addWidget(new QLabel("优先级:"), row, 0);
    layout->addWidget(prioritySpin, row++, 1);
    layout->addWidget(new QLabel("标签:"), row, 0);
    layout->addWidget(tagsEdit, row++, 1);
    layout->addWidget(new QLabel("摘要/笔记:"), row, 0);
    layout->addWidget(abstractEdit, row++, 1);

    if (paper) {
        titleEdit->setText(paper->title);
        authorsEdit->setText(paper->authors);
        urlEdit->setText(paper->sourceUrl);
        arxivEdit->setText(paper->arxivId);
        sourceCombo->setCurrentText(paper->source);
        sourceTypeCombo->setCurrentText(paper->sourceType);
        categoryCombo->setCurrentText(paper->category);
        prioritySpin->setValue(paper->priority);
        tagsEdit->setText(paper->tags);
        abstractEdit->setPlainText(paper->abstract);
    }

    QDialogButtonBox* buttons = new QDialogButtonBox(QDialogButtonBox::Ok | QDialogButtonBox::Cancel, &dialog);
    layout->addWidget(buttons, row, 0, 1, 2);

    connect(buttons, &QDialogButtonBox::accepted, &dialog, &QDialog::accept);
    connect(buttons, &QDialogButtonBox::rejected, &dialog, &QDialog::reject);

    if (dialog.exec() != QDialog::Accepted)
        return;

    Paper p;
    p.id = m_editId;
    p.title = titleEdit->text();
    if (p.title.isEmpty()) {
        QMessageBox::warning(this, "错误", "请输入标题");
        return;
    }

    p.authors = authorsEdit->text();
    p.source = sourceCombo->currentText();
    p.sourceType = sourceTypeCombo->currentText();
    p.sourceUrl = urlEdit->text();
    p.arxivId = arxivEdit->text();
    p.category = categoryCombo->currentText();
    p.priority = prioritySpin->value();
    p.tags = tagsEdit->text();
    p.abstract = abstractEdit->toPlainText();
    p.status = "unread";

    if (m_editId > 0) {
        Database::updatePaper(m_editId, p);
        showStatusMessage("已更新", 2000);
    } else {
        Database::addPaper(p);
        showStatusMessage("已添加", 2000);
    }

    loadPapers();
    loadCategories();
    updateStats();
}

void MainWindow::openPaperUrl(const Paper& paper)
{
    QString url = paper.pdfUrl();
    if (!url.isEmpty() && url != "#") {
        QDesktopServices::openUrl(QUrl(url));
    }
}

void MainWindow::onOpenUrl()
{
}

void MainWindow::onCancelDialog()
{
}

void MainWindow::onSavePaper()
{
}

void MainWindow::onExtractionComplete(int paperId, const QString& result)
{
    if (paperId > 0) {
        showStatusMessage(QString("导入成功 #%1").arg(paperId), 3000);
        loadPapers();
        loadCategories();
        updateStats();
    } else {
        showStatusMessage(QString("导入失败: %1").arg(result), 3000);
    }
}

void MainWindow::onSummaryComplete(int paperId, const QString& summary)
{
    if (paperId > 0) {
        showStatusMessage(QString("摘要生成完成 #%1").arg(paperId), 3000);
        loadPapers();
    }
}

void MainWindow::onSyncComplete(int papersAdded)
{
    showStatusMessage(QString("同步完成 (+%1)").arg(papersAdded), 3000);
    loadPapers();
    loadCategories();
    updateStats();
}

void MainWindow::onSyncError(const QString& error)
{
    showStatusMessage(QString("同步错误: %1").arg(error), 3000);
}

void MainWindow::showStatusMessage(const QString& msg, int timeout)
{
    statusBar()->showMessage(msg, timeout);
}