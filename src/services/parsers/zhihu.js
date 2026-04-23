const BaseParser = require('./base');

class ZhihuParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;

    const cleaned = this.cleanHtml(html);
    const title = this.extractTitle(cleaned);
    const authors = this.extractAuthors(cleaned);
    const mainContent = this.extractMainContent(cleaned);
    const content = this.parseContentBlocks(mainContent);

    return {
      title,
      authors,
      content,
      images: this.media.images,
      videos: this.media.videos,
      audios: this.media.audios,
    };
  }
}

module.exports = new ZhihuParser();