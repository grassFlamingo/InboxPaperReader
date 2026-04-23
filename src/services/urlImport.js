const db = require('../db/database');
const config = require('../../config');
const { BackgroundService } = require('./backgroundService');
const { parseUrl, fetchAndSaveHtml } = require('./parsers');

class UrlImportService extends BackgroundService {
  constructor(options = {}) {
    super('urlImport', {
      label: 'URL解析',
      enabled: options.enabled !== false,
      intervalMs: config.BG_WORKER?.URL_IMPORT_INTERVAL_MS || 60000,
      initialDelayMs: options.initialDelayMs || 5000,
    });
  }

  async hasPending() {
    const rows = db.queryAll(`
      SELECT id FROM url_imports WHERE status IN ('pending', 'fallback') LIMIT 1
    `);
    return rows.length > 0;
  }

  async execute() {
    console.debug('[UrlImportService] Processing pending URL imports...');

    const pending = db.queryAll(`
      SELECT * FROM url_imports WHERE status IN ('pending', 'fallback') ORDER BY id
    `);

    console.debug(`[UrlImportService] Found ${pending.length} pending imports`);

    for (const row of pending) {
      try {
        if (row.status === 'pending') {
          await fetchAndSaveHtml(row.url, row.id);
        }

        const result = await parseUrl(row.id, row.url);

        if (result && row.status !== 'failed') {
          const parsedData = JSON.parse(row.parsed_data || '{}');
          const title = parsedData.title || row.url;
          const authors = parsedData.authors || '';

          const markdownContent = this.renderToMarkdown(result);

          const paperId = db.runQuery(`
            INSERT INTO papers (title, authors, abstract, source_url, source_type, markdown_content, category, priority, tags, notes, status)
            VALUES (?, ?, ?, ?, 'web', ?, ?, ?, ?, ?, 'unread')
          `, [title, authors, '', row.url, markdownContent, '其他', 3, '', '']);

          db.run('UPDATE url_imports SET paper_id=?, status=? WHERE id=?', [paperId, 'completed', row.id]);

          console.debug(`[UrlImportService] Imported URL #${row.id} to paper #${paperId}`);
          this.status.processed++;

          setTimeout(() => {
            const tm = require('../services/taskManager');
            tm.runTask('summary');
          }, 1000);
        } else {
          this.status.errors++;
        }
      } catch (e) {
        this.status.errors++;
        console.error(`[UrlImportService] Error #${row.id}:`, e.message);
        db.run('UPDATE url_imports SET status=?, error_message=? WHERE id=?', ['failed', e.message, row.id]);
      }

      await this.yieldIfNeeded();
      await this._setTimeout(2000);
    }

    console.debug(`[UrlImportService] Done: ${this.status.processed} imported, ${this.status.errors} errors`);
  }

  renderToMarkdown(result) {
    if (!result || !result.content) return '';

    let md = '';
    if (result.title) md += `# ${result.title}\n\n`;
    if (result.authors) md += `_${result.authors}_\n\n`;

    for (const block of result.content) {
      if (block.type === 'heading') {
        md += '#'.repeat(block.level || 1) + ` ${block.text}\n\n`;
      } else if (block.type === 'paragraph') {
        md += `${block.text}\n\n`;
      } else if (block.type === 'code') {
        md += '```' + (block.language || '') + '\n' + block.text + '\n```\n\n';
      } else if (block.type === 'blockquote') {
        md += '> ' + block.text + '\n\n';
      } else if (block.type === 'list') {
        block.items.forEach((item, i) => {
          md += block.ordered ? `${i + 1}. ${item}\n` : `- ${item}\n`;
        });
        md += '\n';
      } else if (block.type === 'image') {
        const src = block.url || block.path || '';
        md += `![${block.alt || ''}](${src})\n\n`;
      }
    }

    return md;
  }
}

module.exports = { UrlImportService };