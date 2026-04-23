const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../../../config');

const CACHE_DIR = config.CACHE?.DIR || path.join(__dirname, '../../../../cache');
const HTML_DIR = path.join(CACHE_DIR, config.CACHE?.HTML_SUBDIR || 'html');
const MEDIA_DIR = path.join(CACHE_DIR, 'media');

function detectWebsite(url) {
  const u = url.toLowerCase();
  if (u.includes('mp.weixin.qq.com') || u.includes('weixin.qq.com')) return 'wechat';
  if (u.includes('twitter.com') || u.includes('x.com')) return 'twitter';
  if (u.includes('medium.com') || u.includes('substack.com')) return 'medium';
  if (u.includes('zhihu.com')) return 'zhihu';
  if (u.includes('bilibili.com')) return 'bilibili';
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (u.includes('ackype.net')) return 'huggingface';
  if (u.includes('openai.com') || u.includes('anthropic.com') || u.includes('deepmind.com')) return 'ai_blog';
  if (u.includes('github.com')) return 'github';
  return 'generic';
}

function getParser(website) {
  const parsers = {
    wechat: require('./wechat'),
    twitter: require('./twitter'),
    medium: require('./medium'),
    zhihu: require('./zhihu'),
    bilibili: require('./bilibili'),
    youtube: require('./youtube'),
    huggingface: require('./huggingface'),
    ai_blog: require('./ai_blog'),
    github: require('./github'),
    generic: require('./generic'),
  };
  return parsers[website] || parsers.generic;
}

function getDomainHash(url) {
  try {
    const hostname = new URL(url).hostname.replace(/\./g, '_');
    const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    return `${hostname}_${hash}`;
  } catch (e) {
    return crypto.createHash('md5').update(url).digest('hex').substring(0, 16);
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function saveHtml(html, importId, url) {
  ensureDir(HTML_DIR);
  const domainHash = getDomainHash(url);
  const filename = `${importId}_${domainHash}.html`;
  const filepath = path.join(HTML_DIR, filename);
  fs.writeFileSync(filepath, html, 'utf8');
  return filepath;
}

function ensureMediaDir(type, importId) {
  const dir = path.join(MEDIA_DIR, type, String(importId));
  ensureDir(dir);
  return dir;
}

function getMediaPath(type, importId, index, ext) {
  const dir = ensureMediaDir(type, importId);
  const filename = `${index}${ext || '.dat'}`;
  return path.join(dir, filename);
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 80);
}

function resolveUrl(base, relative) {
  if (!relative) return null;
  if (relative.startsWith('data:')) return null;
  if (relative.startsWith('//')) return 'https:' + relative;
  if (relative.startsWith('http')) return relative;
  try {
    return new URL(relative, base).href;
  } catch (e) {
    return null;
  }
}

module.exports = {
  detectWebsite,
  getParser,
  getDomainHash,
  ensureDir,
  saveHtml,
  ensureMediaDir,
  getMediaPath,
  sanitizeFilename,
  resolveUrl,
  HTML_DIR,
  MEDIA_DIR,
  CACHE_DIR,
};