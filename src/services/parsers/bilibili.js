const BaseParser = require('./base');

class BilibiliParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;
    return { title: this.extractTitle(html), authors: '', content: [], images: [], videos: [], audios: [] };
  }
}

module.exports = new BilibiliParser();