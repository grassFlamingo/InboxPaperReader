const BaseParser = require('./base');

class HuggingfaceParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;
    const cleaned = this.cleanHtml(html);
    const title = this.extractTitle(cleaned);
    const author = this.extractAuthors(cleaned);
    const mainContent = this.extractMainContent(cleaned);
    const content = this.parseContentBlocks(mainContent);
    return { title, authors: author, content, images: [], videos: [], audios: [] };
  }
}

module.exports = new HuggingfaceParser();