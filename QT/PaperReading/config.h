#ifndef CONFIG_H
#define CONFIG_H

#include <QString>
#include <QStringList>
#include <QCoreApplication>

class Config
{
public:
    static QString databasePath()
    {
        return QStringLiteral("/home/aliy/GitHub/paper_reading_webui/papers.db");
    }

    static QString llmBaseUrl()
    {
        return QStringLiteral("https://dashscope.aliyuncs.com/compatible-mode/v1");
    }

    static QString llmApiKey()
    {
        return QStringLiteral("sk-f3b71311bd994bdf8de46e93e19e0142");
    }

    static QString llmModel()
    {
        return QStringLiteral("qwen3-max-2026-01-23");
    }

    static QStringList aiCategories()
    {
        return QStringList({
            QStringLiteral("KV Cache / Serving"),
            QStringLiteral("LLM 推理优化"),
            QStringLiteral("模型架构"),
            QStringLiteral("多模态 / VLM"),
            QStringLiteral("LLM 推理与思维链"),
            QStringLiteral("数据与训练"),
            QStringLiteral("LLM + RL"),
            QStringLiteral("Agent"),
            QStringLiteral("评测 / Benchmark"),
            QStringLiteral("Diffusion / 生成"),
            QStringLiteral("NLP / 语言理解"),
            QStringLiteral("CV / 图像"),
            QStringLiteral("机器人 / VLA"),
            QStringLiteral("语音 / 音频"),
            QStringLiteral("安全 / 对齐"),
            QStringLiteral("高效计算 / 量化"),
            QStringLiteral("其他")
        });
    }

    static QStringList sourceTypes()
    {
        return QStringList({
            QStringLiteral("paper"),
            QStringLiteral("wechat_article"),
            QStringLiteral("twitter_thread"),
            QStringLiteral("blog_post"),
            QStringLiteral("video"),
            QStringLiteral("other")
        });
    }

    static QStringList sourceNames()
    {
        return QStringList({
            QStringLiteral("arXiv"),
            QStringLiteral("微信公众号"),
            QStringLiteral("Twitter/X"),
            QStringLiteral("Blog"),
            QStringLiteral("Video"),
            QStringLiteral("Web")
        });
    }

    static QStringList sources()
    {
        return QStringList({
            QStringLiteral("arXiv"),
            QStringLiteral("ACM DL"),
            QStringLiteral("Oxford"),
            QStringLiteral("ResearchGate"),
            QStringLiteral("微信公众号"),
            QStringLiteral("Twitter/X"),
            QStringLiteral("Blog"),
            QStringLiteral("其他")
        });
    }

    static QString emailImapHost()
    {
        return QStringLiteral("imap.qq.com");
    }

    static int emailImapPort()
    {
        return 993;
    }

    static QString emailAccount()
    {
        return QStringLiteral("2651522002@qq.com");
    }

    static QString emailPassword()
    {
        return QStringLiteral("wvzrkckyoqyoecaa");
    }

    static QString emailFolder()
    {
        return QStringLiteral("其他文件夹/GoogleScholar");
    }

    static QString emailSender()
    {
        return QStringLiteral("scholaralerts-noreply@google.com");
    }

    static int emailCheckDays()
    {
        return 30;
    }

    static int emailMaxEmails()
    {
        return 64;
    }

    static bool emailEnabled()
    {
        return true;
    }

    static int emailSyncHour()
    {
        return 8;
    }

    static int emailSyncMinute()
    {
        return 0;
    }
};

#endif