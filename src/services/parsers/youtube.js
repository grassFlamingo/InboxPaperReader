const BaseParser = require('./base');

class YoutubeParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;
    const cleaned = this.cleanHtml(html);
    const title = this.extractTitle(cleaned);
    const author = this.extractAuthors(cleaned);
    const desc = this.extractDescription(cleaned);
    const content = [{ type: 'paragraph', text: desc || '' }];
    return { title, authors: author, content, images: [], videos: [], audios: [] };
  }
}

module.exports = new YoutubeParser();