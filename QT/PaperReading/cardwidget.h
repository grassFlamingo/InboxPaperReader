#ifndef CARDWIDGET_H
#define CARDWIDGET_H

#include <QWidget>
#include <QMouseEvent>
#include "paper.h"

class CardWidget : public QWidget
{
    Q_OBJECT

public:
    explicit CardWidget(const Paper& paper, QWidget* parent = nullptr);
    const Paper& getPaper() const { return m_paper; }

signals:
    void clicked(const Paper& paper);
    void doubleClicked(const Paper& paper);
    void statusChanged(const Paper& paper);
    void ratingChanged(const Paper& paper, int rating);
    void deleteRequested(const Paper& paper);

protected:
    void mousePressEvent(QMouseEvent* event) override;
    void mouseDoubleClickEvent(QMouseEvent* event) override;

private:
    Paper m_paper;
    void updateStyle();
};

#endif