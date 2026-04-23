const path = require('path');
const fs = require('fs');
const config = require('../../../config');
const { resolveUrl, ensureMediaDir, getMediaPath, sanitizeFilename } = require('./utils');
const { fetchUrlText } = require('../web');

const PARSER_CONFIG = config.PARSER || {};
const MAX_IMAGE_SIZE = (PARSER_CONFIG.MAX_IMAGE_SIZE_MB || 5) * 1024 * 1024;
const MAX_VIDEO_SIZE = (PARSER_CONFIG.MAX_VIDEO_SIZE_MB || 10) * 1024 * 1024;
const MAX_AUDIO_SIZE = (PARSER_CONFIG.MAX_AUDIO_SIZE_MB || 10) * 1024 * 1024;

const MEDIA_TYPES = {
  IMAGE: 'images',
  VIDEO: 'videos',
  AUDIO: 'audios',
};

class BaseParser {
  constructor() {
    this.url = '';
    this.importId = 0;
    this.media = {
      images: [],
      videos: [],
      audios: [],
    };
  }

  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;
    throw new Error('parse() must be implemented by subclass');
  }

  async fetch(url, timeout = 15000) {
    return await fetchUrlText(url, timeout);
  }

  cleanHtml(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<video[\s\S]*?<\/video>/gi, '[video]')
      .replace(/<audio[\s\S]*?<\/audio>/gi, '[audio]');
  }

  extractTitle(html) {
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (title) return title[1].trim();
    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) return og[1].trim();
    const h1 = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1) return h1[1].trim();
    return '';
  }

  extractAuthors(html) {
    const author = html.match(/<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i);
    if (author) return author[1].trim();
    return '';
  }

  extractDescription(html) {
    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (og) return og[1].trim();
    const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (meta) return meta[1].trim();
    return '';
  }

  extractMainContent(html) {
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]+class=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*main[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id=["'][^"']*content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id=["'][^"']*main[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 100) {
        return match[1];
      }
    }
    return html;
  }

  extractFeaturedImage(content) {
    const og = content.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og) return { url: og[1], is_featured: true };
    const twitter = content.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (twitter) return { url: twitter[1], is_featured: true };
    const img = content.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
    if (img) return { url: img[1], is_featured: true };
    return null;
  }

  extractMediaUrls(content) {
    const urls = { images: [], videos: [], audios: [] };
    const baseUrl = this.url;

    const imgMatches = content.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi);
    for (const match of imgMatches) {
      const src = resolveUrl(baseUrl, match[1]);
      if (src && !src.startsWith('data:')) {
        urls.images.push(src);
      }
    }

    const videoMatches = content.matchAll(/<video[^>]+poster=["']([^"']+)["']/gi);
    for (const match of videoMatches) {
      urls.videos.push({ url: resolveUrl(baseUrl, match[1]), type: 'poster' });
    }
    const videoSrcMatches = content.matchAll(/<video[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/gi);
    for (const match of videoSrcMatches) {
      urls.videos.push({ url: resolveUrl(baseUrl, match[1]), type: 'source' });
    }

    const audioMatches = content.matchAll(/<audio[^>]*>[\s\S]*?<source[^>]+src=["']([^"']+)["']/gi);
    for (const match of audioMatches) {
      urls.audios.push({ url: resolveUrl(baseUrl, match[1]), type: 'source' });
    }

    return urls;
  }

  parseContentBlocks(content) {
    const blocks = [];
    const cleaned = this.cleanHtml(content);
    const element = cleaned.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '</p>\n').replace(/<\/div>/gi, '</div>\n');

    let currentParagraph = '';
    const tagRegex = /<([a-zA-Z][a-zA-Z0-9]*)(?:[^>]*)>([\s\S]*?)<\/\1>/gi;
    let lastIndex = 0;
    let match;

    const tempElement = element;
    while ((match = tagRegex.exec(tempElement)) !== null) {
      const tag = match[1].toLowerCase();
      const text = this.stripTags(match[2]).trim();

      if (text.length === 0) {
        continue;
      }

      if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
        if (currentParagraph) {
          blocks.push({ type: 'paragraph', text: currentParagraph.trim() });
          currentParagraph = '';
        }
        blocks.push({ type: 'heading', level: parseInt(tag[1]), text: text.trim() });
      } else if (tag === 'blockquote') {
        if (currentParagraph) {
          blocks.push({ type: 'paragraph', text: currentParagraph.trim() });
          currentParagraph = '';
        }
        blocks.push({ type: 'blockquote', text: text.trim() });
      } else if (tag === 'pre' || tag === 'code') {
        if (currentParagraph) {
          blocks.push({ type: 'paragraph', text: currentParagraph.trim() });
          currentParagraph = '';
        }
        const lang = match[0].match(/class=["']language-(\w+)["']/i);
        blocks.push({ type: 'code', language: lang ? lang[1] : '', text: text.trim() });
      } else if (tag === 'ul' || tag === 'ol') {
        const items = [];
        const liMatches = text.matchAll(/<li[^>]*>([^<]+)<\/li>/gi);
        for (const li of liMatches) {
          items.push(this.stripTags(li[1]).trim());
        }
        if (items.length > 0) {
          if (currentParagraph) {
            blocks.push({ type: 'paragraph', text: currentParagraph.trim() });
            currentParagraph = '';
          }
          blocks.push({ type: 'list', ordered: tag === 'ol', items });
        }
      } else if (tag === 'img') {
        const src = match[0].match(/src=["']([^"']+)["']/i);
        const alt = match[0].match(/alt=["']([^"']+)["']/i);
        if (src) {
          blocks.push({ type: 'image', url: resolveUrl(this.url, src[1]), alt: alt ? alt[1] : '' });
        }
      } else if (['p', 'div', 'section'].includes(tag)) {
        currentParagraph += text + '\n';
      }
    }

    if (currentParagraph.trim()) {
      blocks.push({ type: 'paragraph', text: currentParagraph.trim() });
    }

    if (blocks.length === 0 && cleaned.trim()) {
      blocks.push({ type: 'paragraph', text: this.stripTags(cleaned).trim() });
    }

    return blocks;
  }

  stripTags(html) {
    return html
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  }

  async downloadMedia(url, type, index) {
    if (!url) return null;

    const ext = this.getExt(url, type);
    const filepath = getMediaPath(type, this.importId, index, ext);

    try {
      const res = await this.fetch(url, 30000);
      const buffer = Buffer.from(res);

      if (buffer.length === 0) return null;

      fs.writeFileSync(filepath, buffer);
      const relativePath = path.join(type, String(this.importId), `${index}${ext}`);

      if (type === MEDIA_TYPES.IMAGE) {
        this.media.images.push({ url, path: relativePath, in_main: false, is_featured: false });
      } else if (type === MEDIA_TYPES.VIDEO) {
        this.media.videos.push({ url, path: relativePath, type: 'local' });
      } else if (type === MEDIA_TYPES.AUDIO) {
        this.media.audios.push({ url, path: relativePath, type: 'local' });
      }

      return relativePath;
    } catch (e) {
      console.warn(`[Parser] Failed to download ${type} ${url}:`, e.message);
      if (type === MEDIA_TYPES.IMAGE) {
        this.media.images.push({ url, path: null, in_main: false, is_featured: false });
      } else if (type === MEDIA_TYPES.VIDEO) {
        this.media.videos.push({ url, path: null, type: 'external' });
      } else if (type === MEDIA_TYPES.AUDIO) {
        this.media.audios.push({ url, path: null, type: 'external' });
      }
      return null;
    }
  }

  getExt(url, type) {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname).toLowerCase();
      if (ext) return ext;
    } catch (e) {}
    if (type === MEDIA_TYPES.IMAGE) return '.jpg';
    if (type === MEDIA_TYPES.VIDEO) return '.mp4';
    if (type === MEDIA_TYPES.AUDIO) return '.mp3';
    return '.dat';
  }

  renderToMarkdown(data) {
    if (!data || !data.content) return '';

    let md = '';
    if (data.title) md += `# ${data.title}\n\n`;
    if (data.authors) md += `_${data.authors}_\n\n`;

    for (const block of data.content) {
      if (block.type === 'heading') {
        md += '#'.repeat(block.level) + ` ${block.text}\n\n`;
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
        md += `![${block.alt || ''}](${block.url || block.path || ''})\n\n`;
      }
    }

    return md;
  }

  renderToHtml(data) {
    if (!data || !data.content) return '';

    let html = '';
    if (data.title) html += `<h1>${data.title}</h1>\n`;
    if (data.authors) html += `<p><em>${data.authors}</em></p>\n`;

    for (const block of data.content) {
      if (block.type === 'heading') {
        html += `<h${block.level}>${block.text}</h${block.level}>\n`;
      } else if (block.type === 'paragraph') {
        html += `<p>${block.text}</p>\n`;
      } else if (block.type === 'code') {
        html += `<pre><code>${block.text}</code></pre>\n`;
      } else if (block.type === 'blockquote') {
        html += `<blockquote>${block.text}</blockquote>\n`;
      } else if (block.type === 'list') {
        const tag = block.ordered ? 'ol' : 'ul';
        html += `<${tag}>\n`;
        for (const item of block.items) {
          html += `<li>${item}</li>\n`;
        }
        html += `</${tag}>\n`;
      } else if (block.type === 'image') {
        html += `<img src="${block.url || block.path || ''}" alt="${block.alt || ''}">\n`;
      }
    }

    return html;
  }
}

module.exports = BaseParser;
module.exports.MEDIA_TYPES = MEDIA_TYPES;