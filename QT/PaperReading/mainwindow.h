#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QList>
#include <QString>
#include <QMap>
#include <QScrollArea>
#include <QVBoxLayout>
#include "database.h"

QT_BEGIN_NAMESPACE
namespace Ui { class MainWindow; }
QT_END_NAMESPACE

class Paper;
class ApiClient;
class EmailSync;
class CardWidget;
class QLineEdit;
class QComboBox;
class QLabel;
class QPushButton;
class QListWidget;

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    void onAddPaper();
    void onImportUrl();
    void onSyncEmails();
    void onSearchChanged();
    void onFilterChanged();
    void onSortChanged();
    void onLayoutChanged();
    void onCardClicked(const Paper& paper);
    void onCardDoubleClicked(const Paper& paper);
    void onCardStatusChanged(const Paper& paper);
    void onCardRatingChanged(const Paper& paper, int rating);
    void onCardDeleteRequested(const Paper& paper);
    void onRefresh();
    void onEditPaper(const Paper& paper);
    void onDeletePaper(const Paper& paper);
    void onCycleStatus(const Paper& paper);
    void onSavePaper();
    void onCancelDialog();
    void onOpenUrl();

    void onExtractionComplete(int paperId, const QString& result);
    void onSummaryComplete(int paperId, const QString& summary);
    void onSyncComplete(int papersAdded);
    void onSyncError(const QString& error);

    void showStatusMessage(const QString& msg, int timeout = 3000);

private:
    void setupUi();
    void setupConnections();
    void loadPapers();
    void loadCategories();
    void updateStats();
    void updateCards();
    void showPaperDialog(const Paper* paper = nullptr);
    void openPaperUrl(const Paper& paper);

    Ui::MainWindow *ui;
    ApiClient* m_apiClient;
    EmailSync* m_emailSync;

    QList<Paper> m_papers;
    QList<CategoryCount> m_categories;
    QList<CardWidget*> m_cardWidgets;
    QString m_currentFilterCategory;
    QString m_currentFilterStatus;
    QString m_currentFilterSourceType;
    QString m_currentSort;
    QString m_searchText;
    bool m_gridMode;
    int m_editId;
    QLineEdit* m_searchBox;
    QLabel* m_statsLabel;
    QWidget* m_cardsContainer;
    QVBoxLayout* m_cardsLayout;
    QScrollArea* m_cardsScrollArea;
};

#endif