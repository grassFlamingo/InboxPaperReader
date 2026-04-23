const db = require('../db/database');
const config = require('../../config');
const { BackgroundService } = require('./backgroundService');
const { extractTechTermsFromText, upsertTechTerm, checkInconsistencies } = require('../routes/techterms');

class TerminologyService extends BackgroundService {
  constructor(options = {}) {
    super('terminology', {
      label: 'Terminology',
      enabled: options.enabled !== false,
      intervalMs: options.intervalMs || 120000,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 15000,
    });
  }

  async hasPending() {
    const papers = db.queryAll(`
      SELECT p.id FROM papers p
      WHERE p.abstract IS NOT NULL AND p.abstract != ''
      AND LENGTH(p.abstract) > 100
      AND NOT EXISTS (SELECT 1 FROM paper_terms pt WHERE pt.paper_id = p.id)
      LIMIT 1
    `);
    return papers.length > 0;
  }

  async execute() {
    const papers = db.queryAll(`
      SELECT p.id, p.title, p.abstract, p.category
      FROM papers p
      WHERE p.abstract IS NOT NULL AND p.abstract != ''
      AND LENGTH(p.abstract) > 100
      AND NOT EXISTS (SELECT 1 FROM paper_terms pt WHERE pt.paper_id = p.id)
      ORDER BY p.priority DESC, p.id DESC
      LIMIT 30
    `);

    console.log(`[${this.label}] Found ${papers.length} papers to extract terms from`);

    for (const paper of papers) {
      try {
        const terms = await extractTechTermsFromText(paper.abstract, paper.id);
        for (const t of terms) {
          upsertTechTerm(t.term_en, t.term_zh, t.context || '', paper.id);
        }
        this.status.processed++;
        if (terms.length > 0) {
          console.log(`[${this.label}] #${paper.id}: extracted ${terms.length} terms`);
        }
      } catch (e) {
        this.status.errors++;
        console.error(`[${this.label}] Error #${paper.id}:`, e.message);
      }
      await this.yieldIfNeeded();
      await this._setTimeout(500);
    }

    console.log(`[${this.label}] Done: ${this.status.processed} papers, ${this.status.errors} errors`);
  }
}

class TerminologyConsistencyService extends BackgroundService {
  constructor(options = {}) {
    super('terminologyCheck', {
      label: 'Term Consistency',
      enabled: options.enabled !== false,
      intervalMs: options.intervalMs || 3600000,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 30000,
    });
  }

  async execute() {
    const inconsistencies = checkInconsistencies();
    console.log(`[${this.label}] Found ${inconsistencies.length} inconsistent terms`);

    for (const inc of inconsistencies) {
      try {
        const variants = inc.variants.split(',');
        if (variants.length < 2) continue;

        const keepTerm = variants[variants.length - 1];
        const targetRows = db.queryAll(`
          SELECT id FROM tech_terms
          WHERE term_en = ? AND term_zh = ?
        `, [inc.term_en, keepTerm]);

        const targetId = targetRows.length > 0 ? targetRows[0].id : null;

        const sourceRows = db.queryAll(`
          SELECT id, use_count FROM tech_terms
          WHERE term_en = ? AND term_zh != ?
        `, [inc.term_en, keepTerm]);

        for (const row of sourceRows) {
          if (targetId) {
            db.runQuery(`UPDATE tech_terms SET use_count = use_count + ? WHERE id = ?`, [row.use_count, targetId]);
            db.runQuery(`DELETE FROM tech_terms WHERE id = ?`, [row.id]);
          } else {
            db.runQuery(`UPDATE tech_terms SET term_zh = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [keepTerm, row.id]);
          }
          this.status.processed++;
        }
      } catch (e) {
        this.status.errors++;
        console.error(`[${this.label}] Error fixing ${inc.term_en}:`, e.message);
      }
    }

    console.log(`[${this.label}] Done: ${this.status.processed} fixed, ${this.status.errors} errors`);
  }
}

class TerminologyCleanupService extends BackgroundService {
  constructor(options = {}) {
    super('terminologyCleanup', {
      label: 'Term Cleanup',
      enabled: options.enabled !== false,
      intervalMs: options.intervalMs || 1800000,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 25000,
    });
  }

  async execute() {
    console.log(`[${this.label}] Starting cleanup...`);

    db.runQuery(`UPDATE tech_terms SET verified = 0 WHERE use_count < 0`);
    const lowCount = db.runQuery(`DELETE FROM tech_terms WHERE use_count = 0 AND verified = 0`);
    this.status.processed += lowCount;

    const duplicates = db.queryAll(`
      SELECT term_en, term_zh, COUNT(*) as cnt
      FROM tech_terms
      WHERE (term_en IS NULL OR term_en = '' OR term_zh IS NULL OR term_zh = '')
      GROUP BY term_en, term_zh
    `);
    if (duplicates.length > 0) {
      db.runQuery(`DELETE FROM tech_terms WHERE term_en IS NULL OR term_en = '' OR term_zh IS NULL OR term_zh = ''`);
      this.status.processed += duplicates.length;
    }

    const tooShort = db.queryAll(`SELECT id FROM tech_terms WHERE LENGTH(term_en) < 2 OR LENGTH(term_zh) < 2`);
    for (const row of tooShort) {
      db.runQuery(`DELETE FROM tech_terms WHERE id = ?`, [row.id]);
    }
    this.status.processed += tooShort.length;

    console.log(`[${this.label}] Done: cleaned ${this.status.processed}, ${this.status.errors} errors`);
  }
}

class TerminologyMergeService extends BackgroundService {
  constructor(options = {}) {
    super('terminologyMerge', {
      label: 'Term Merge',
      enabled: options.enabled !== false,
      intervalMs: options.intervalMs || 7200000,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 35000,
    });
  }

  _isCompoundPhrase(termEn) {
    if (!termEn) return false;
    const cleaned = termEn.replace(/[()]/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length >= 4) return true;
    const compoundPattern = /^(large |multi-|multi |speech |spoken |visual |audio |video |cross-|long-|open-|zero-|-based |-as-a-|-as-a |-to-|-with |for |with |of |and )/i;
    if (compoundPattern.test(cleaned)) return true;
    const abbrev = /^[A-Z]{2,4}$/.test(termEn);
    if (abbrev) return false;
    return false;
  }

  _normalizeZh(termZh) {
    if (!termZh) return '';
    return termZh.replace(/[（）()「」『』【】\[\]]/g, '').replace(/[-－]/g, '').replace(/[型模型模块]/g, '').trim();
  }

  _normalizeEn(termEn) {
    if (!termEn) return '';
    return termEn.replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').toLowerCase().trim();
  }

  _isEnSimilar(a, b) {
    if (!a || !b) return false;
    const normA = this._normalizeEn(a);
    const normB = this._normalizeEn(b);
    if (normA === normB) return true;
    if (normA.startsWith(normB) || normB.startsWith(normA)) return true;
    if (Math.abs(normA.length - normB.length) > 4) return false;
    let diff = 0;
    for (let i = 0; i < Math.min(normA.length, normB.length); i++) {
      if (normA[i] !== normB[i]) diff++;
      if (diff > 2) return false;
    }
    return diff <= 1;
  }

  _mergeGroup(group) {
    const winner = group[0];
    const totalUseCount = group.reduce((sum, t) => sum + t.use_count, 0);
    db.runQuery(`UPDATE tech_terms SET use_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [totalUseCount, winner.id]);
    for (const t of group) {
      if (t.id === winner.id) continue;
      db.runQuery(`DELETE FROM tech_terms WHERE id = ?`, [t.id]);
    }
  }

  _findPhase1Groups() {
    const rows = db.queryAll(`
      SELECT term_zh, GROUP_CONCAT(id, ',') as ids
      FROM tech_terms
      WHERE term_zh IS NOT NULL AND term_zh != ''
      GROUP BY term_zh
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `);
    return rows.map(row => {
      const ids = row.ids.split(',').filter(Boolean).map(Number);
      return db.queryAll(
        `SELECT id, term_en, term_zh, use_count FROM tech_terms WHERE id IN (${ids.map(() => '?').join(',')}) ORDER BY use_count DESC`,
        ids
      );
    });
  }

  _findPhase2Groups() {
    const allTerms = db.queryAll(`
      SELECT id, term_en, term_zh, use_count
      FROM tech_terms
      WHERE term_zh IS NOT NULL AND term_zh != ''
    `);

    const zhGroups = new Map();
    for (const t of allTerms) {
      const nz = this._normalizeZh(t.term_zh);
      if (!zhGroups.has(nz)) zhGroups.set(nz, []);
      zhGroups.get(nz).push(t);
    }

    const groups = [];
    const used = new Set();

    for (const [nz, terms] of zhGroups) {
      if (terms.length < 2) continue;

      const eligible = terms.filter(t => !this._isCompoundPhrase(t.term_en));
      if (eligible.length < 2) continue;

      const checked = new Set();
      for (const t1 of eligible) {
        if (checked.has(t1.id)) continue;

        const group = [t1];
        checked.add(t1.id);

        for (const t2 of eligible) {
          if (checked.has(t2.id)) continue;
          if (t1.term_zh === t2.term_zh) continue;
          if (this._isEnSimilar(t1.term_en, t2.term_en)) {
            group.push(t2);
            checked.add(t2.id);
          }
        }

        if (group.length > 1) {
          group.forEach(t => used.add(t.id));
          groups.push(group);
        }
      }
    }

    return groups;
  }

  async execute() {
    console.log(`[${this.label}] Starting merge...`);

    const phase1 = this._findPhase1Groups();
    console.log(`[${this.label}] Phase 1: ${phase1.length} groups (exact zh)`);
    for (const group of phase1) {
      if (group.length < 2) continue;
      this._mergeGroup(group);
      this.status.processed += group.length - 1;
    }

    const phase2 = this._findPhase2Groups();
    console.log(`[${this.label}] Phase 2: ${phase2.length} groups (normalized zh + en)`);
    for (const group of phase2) {
      if (group.length < 2) continue;
      this._mergeGroup(group);
      this.status.processed += group.length - 1;
    }

    console.log(`[${this.label}] Done: merged ${this.status.processed}, ${this.status.errors} errors`);
  }
}

class TerminologyOrganizeService extends BackgroundService {
  constructor(options = {}) {
    super('terminologyOrganize', {
      label: 'Term Organize',
      enabled: options.enabled !== false,
      intervalMs: options.intervalMs || 14400000,
      initialDelayMs: options.initialDelayMs || config.BG_WORKER?.DELAY_MS + 40000,
    });
  }

  _categorize(termEn, termZh) {
    const term = (termEn + ' ' + (termZh || '')).toLowerCase();

    const categories = {
      'AI/ML': ['machine learning', 'deep learning', 'neural network', 'cnn', 'rnn', 'transformer', 'attention', 'gpt', 'bert', 'llm', 'diffusion', 'gan', 'reinforcement', 'rl', 'reward', 'policy', 'agent'],
      'CV': ['image', 'vision', 'object detection', 'segmentation', 'yolo', 'resnet', 'tracking', 'recognition', 'feature'],
      'NLP': ['language', 'text', 'nlp', 'translation', 'parsing', 'token', 'embedding', 'semantic'],
      'Optimization': ['optimization', 'gradient', 'loss', 'optimizer', 'adam', 'sgd', 'learning rate'],
      'Data': ['dataset', 'training', 'test', 'validation', 'sample', 'batch', 'augmentation'],
      'Evaluation': ['accuracy', 'precision', 'recall', 'f1', 'score', 'metric', 'benchmark', 'bleu', 'rouge'],
    };

    for (const [cat, keywords] of Object.entries(categories)) {
      for (const kw of keywords) {
        if (term.includes(kw)) return cat;
      }
    }
    return 'General';
  }

  async execute() {
    console.log(`[${this.label}] Starting organize...`);

    try {
      const terms = db.queryAll(`SELECT id, term_en, term_zh FROM tech_terms WHERE category IS NULL OR category = ''`);

      for (const term of terms) {
        try {
          const category = this._categorize(term.term_en, term.term_zh);
          db.runQuery(`UPDATE tech_terms SET category = ? WHERE id = ?`, [category, term.id]);
          this.status.processed++;
        } catch (e) {
          this.status.errors++;
        }
      }

      const stats = {};
      const catRows = db.queryAll(`SELECT category, COUNT(*) as cnt FROM tech_terms WHERE verified = 1 GROUP BY category`);
      for (const row of catRows) {
        stats[row.category || 'Uncategorized'] = row.cnt;
      }
      console.log(`[${this.label}] Categories:`, JSON.stringify(stats));
    } catch (e) {
      console.error(`[${this.label}] Error:`, e.message);
      this.status.errors++;
    }

    console.log(`[${this.label}] Done: organized ${this.status.processed}, ${this.status.errors} errors`);
  }
}

module.exports = {
  TerminologyService,
  TerminologyConsistencyService,
  TerminologyCleanupService,
  TerminologyMergeService,
  TerminologyOrganizeService,
};