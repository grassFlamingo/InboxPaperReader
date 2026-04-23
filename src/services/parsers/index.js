const path = require('path');
const db = require('../../db/database');
const config = require('../../../config');
const { detectWebsite, getParser, saveHtml } = require('./utils');

const PARSER_DEV_MODE = config.PARSER?.DEV_MODE || false;

let lastParserError = null;

async function parseUrl(importId, url) {
  const htmlPath = db.queryOne('SELECT html_path FROM url_imports WHERE id = ?', [importId]);
  if (!htmlPath || !htmlPath.html_path) {
    throw new Error('No HTML file found for import ' + importId);
  }

  const fs = require('fs');
  if (!fs.existsSync(htmlPath.html_path)) {
    throw new Error('HTML file not found: ' + htmlPath.html_path);
  }

  const html = fs.readFileSync(htmlPath.html_path, 'utf8');

  const website = detectWebsite(url);
  const parser = getParser(website);

  db.run('UPDATE url_imports SET status=?, parser=? WHERE id=?', ['parsing', website, importId]);

  let result;
  try {
    result = await parser.parse(url, html, importId);
  } catch (e) {
    if (PARSER_DEV_MODE) {
      console.error(`[Parser:${website}] Error:`, e.message);
      db.run('UPDATE url_imports SET status=?, error_message=? WHERE id=?', ['failed', e.message, importId]);
      lastParserError = e.message;
      return null;
    }

    console.warn(`[Parser:${website}] Error, falling back to generic:`, e.message);
    db.run('UPDATE url_imports SET status=?, parser=? WHERE id=?', ['fallback', 'generic', importId]);

    const genericParser = getParser('generic');
    result = await genericParser.parse(url, html, importId);
  }

  if (!result) {
    db.run('UPDATE url_imports SET status=? WHERE id=?', ['failed', importId]);
    return null;
  }

  db.run('UPDATE url_imports SET status=?, parsed_data=? WHERE id=?', 
    ['completed', JSON.stringify(result), importId]);

  return result;
}

async function fetchAndSaveHtml(url, importId) {
  const { fetchUrlText } = require('../web');

  let html;
  try {
    html = await fetchUrlText(url, 15000);
  } catch (e) {
    db.run('UPDATE url_imports SET status=?, error_message=? WHERE id=?', ['failed', e.message, importId]);
    throw e;
  }

  if (!html || html.length < 100) {
    db.run('UPDATE url_imports SET status=?, error_message=? WHERE id=?', ['failed', 'HTML too short or empty', importId]);
    throw new Error('HTML too short or empty');
  }

  const htmlPath = await saveHtml(html, importId, url);
  db.run('UPDATE url_imports SET html_path=? WHERE id=?', [htmlPath, importId]);

  return htmlPath;
}

function getLastError() {
  return lastParserError;
}

module.exports = { parseUrl, fetchAndSaveHtml, getLastError };