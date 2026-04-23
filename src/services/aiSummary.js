const db = require('../db/database');
const config = require('../../config');
const { BackgroundService } = require('./backgroundService');
const { callLlm, cleanThinkTags } = require('./llm');
const { extractTechTermsFromText, upsertTechTerm } = require('../routes/techterms');

class AISummaryService extends BackgroundService {
  constructor(options = {}) {
    super('summarize', {
      label: 'AI Summary',
      enabled: options.enabled !== false,
      intervalMs: 0,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 10000,
    });
  }

  _prepareContext() {
    const prefRows = db.queryAll("SELECT category, ROUND(AVG(user_rating),1) as avg_r FROM papers WHERE user_rating > 0 GROUP BY category");
    const liked = prefRows.filter(r => r.avg_r >= 4).map(r => r.category);
    return {
      systemPrompt: '你是论文快速预览助手。用3-5句中文简洁描述论文核心内容、关键方法和贡献。语言精炼。',
      prefText: liked.length > 0 ? `\n用户偏好高评分分类：${liked.join(', ')}。` : ''
    };
  }

  async hasPending() {
    const papers = db.queryAll(`
      SELECT id FROM papers WHERE abstract IS NOT NULL AND abstract != ''
      AND ((summary IS NULL OR summary = '') OR (ai_category IS NULL OR ai_category = '') OR stars = 0)
      LIMIT 1
    `);
    return papers.length > 0;
  }

  async execute() {
    const ctx = this._prepareContext();
    const papers = db.queryAll(`
      SELECT * FROM papers WHERE abstract IS NOT NULL AND abstract != ''
      AND ((summary IS NULL OR summary = '') OR (ai_category IS NULL OR ai_category = '') OR stars = 0)
      ORDER BY priority DESC, id DESC
    `);

    console.log(`[${this.label}] Found ${papers.length} papers needing summary`);

    for (const paper of papers) {
      try {
        console.debug(`[${this.label}] Processing #${paper.id}: ${paper.title?.slice(0, 50)}`);
        await this._processPaper(paper, ctx);
        this.status.processed++;
      } catch (e) {
        this.status.errors++;
        console.error(`[${this.label}] Error #${paper.id}:`, e.message, e.stack);
        await this._setTimeout(2000);
      }
      await this.yieldIfNeeded();
      await this._setTimeout(500);
    }

    console.log(`[${this.label}] Done: ${this.status.processed} summarized, ${this.status.errors} errors`);
  }

async _processPaper(paper, ctx) {
    let summary = paper.summary || '', aiCategory = paper.ai_category || '', stars = paper.stars || 0;

    if (!summary) {
      console.debug(`[${this.label}] Generating summary for #${paper.id}`);
      const userContent = `Title: ${paper.title}\n` +
        (paper.authors ? `Authors: ${paper.authors}\n` : '') +
        (paper.category ? `Category: ${paper.category}\n` : '') +
        (paper.tags ? `Tags: ${paper.tags}\n` : '') +
        `Abstract: ${paper.abstract}`;
      summary = cleanThinkTags(await callLlm(ctx.systemPrompt, userContent, 1024));
      console.debug(`[${this.label}] Summary result:`, summary?.slice(0, 100), summary?.length > 100 ? '...' : '');
    }

    if (!aiCategory || !stars) {
      console.debug(`[${this.label}] Classifying #${paper.id}`);
      const catList = config.AI_CATEGORIES.join('、');
      const classifyPrompt = `从以下分类选择最合适的：[${catList}]。评估1-5星：5星=里程碑，4星=方法新颖，3星=常规价值，2星=参考有限，1星=低相关${ctx.prefText}
 严格按JSON输出：{"category":"分类名","stars":数字,"reason":"一句话理由"}`;
      const classifyContent = `Title: ${paper.title}\n` + (paper.authors ? `Authors: ${paper.authors}\n` : '') + `Abstract: ${paper.abstract.substring(0, 800)}`;
      const classResult = cleanThinkTags(await callLlm(classifyPrompt, classifyContent, 500));
      console.debug(`[${this.label}] Classification result:`, classResult?.slice(0, 100));
      const jsonMatch = classResult.match(/\{[^}]+\}/);

      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        let cat = data.category || '其他';
        for (const c of config.AI_CATEGORIES) {
          if (cat.toLowerCase().replace(' ', '').includes(c.toLowerCase().replace(' ', ''))) { cat = c; break; }
        }
        const CAT_NORM = {
          'Agent': 'Agent', 'Audio / 音频': '语音 / 音频', 'Benchmark / 软件工具': '评测 / Benchmark',
          'Cybersecurity / Adversarial ML': '安全 / 对齐', 'Cross-Lingual / XAI': '安全 / 对齐',
          'Dataset / Training': '数据与训练', 'Dialogue System': 'NLP / 语言理解', 'Diffusion / 生成': 'Diffusion / 生成',
          'Event Extraction': 'NLP / 语言理解', 'Federated Learning': '高效计算 / 量化',
          'Generative / Diffusion': 'Diffusion / 生成', 'Generative Modeling / Diffusion': 'Diffusion / 生成',
          'Hyperspectral Image / Robustness': 'CV / 图像', 'KV Cache / Serving': 'KV Cache / Serving',
          'Language Model / LLM': '模型架构', 'LLM + RL': 'LLM + RL', 'LLM / RL': 'LLM + RL',
          'LLM / Transformer Architecture': '模型架构', 'Model Architecture': '模型架构',
          'Multi-Modal / VLM': '多模态 / VLM', 'Multi-modal / VLM': '多模态 / VLM', 'MultiModal / VLM': '多模态 / VLM',
          'Multilinguality / MT / XNLI': 'NLP / 语言理解', 'Multimodal / VLM': '多模态 / VLM',
          'Music / 音乐AI, NLP / 语言理解': '语音 / 音频', 'Pre-training': '数据与训练',
          'Retrieval / RAG': 'NLP / 语言理解', 'Retrieval-Augmented Generation (RAG) / Information Retrieval': 'NLP / 语言理解',
          'Robotics / VLA': '机器人 / VLA', 'Security / Alignment': '安全 / 对齐', 'Security / 对齐': '安全 / 对齐',
          'Serving': 'LLM 推理优化', 'Serving / LLM 推理优化': 'LLM 推理优化', 'Sign Language Generation': '语音 / 音频',
          'Speech / Audio': '语音 / 音频', 'Time Series / 序列建模': 'NLP / 语言理解', 'Time Series Forecasting': 'NLP / 语言理解',
          'Tokenizer / NLP': 'NLP / 语言理解', 'VLA': '机器人 / VLA', 'VLM': '多模态 / VLM',
          'VLM / Multi-modal': '多模态 / VLM', 'Vision / CV': 'CV / 图像', 'Vision / VLM': '多模态 / VLM',
          'Vision Language Model / VLM': '多模态 / VLM', 'Vision-Language Model / VLM': '多模态 / VLM',
          'Vision-Language Model / Multimodal': '多模态 / VLM', 'Vision-Language Model / Security': '安全 / 对齐',
          'Vulnerability Detection': '安全 / 对齐', '医学图像处理 / 医学VLM': '多模态 / VLM',
          '推理与思维链': 'LLM 推理与思维链', '推荐系统 / RS': '其他', '推荐系统 / 序列推荐': '其他',
          '理论研究': '其他', '高效计算 / 量化': '高效计算 / 量化',
        };
        if (CAT_NORM[cat]) cat = CAT_NORM[cat];
        if (!aiCategory) aiCategory = cat;
        if (!stars) stars = Math.max(1, Math.min(5, parseInt(data.stars || 3)));
      }
    }

    db.runQuery('UPDATE papers SET summary = ?, ai_category = ?, stars = ?, category = ? WHERE id = ?', [summary, aiCategory, stars, aiCategory, paper.id]);

    const terms = await extractTechTermsFromText(paper.abstract, paper.id);
    for (const t of terms) {
      upsertTechTerm(t.term_en, t.term_zh, t.context || '', paper.id);
    }
  }
}

module.exports = {
  AISummaryService,
};
