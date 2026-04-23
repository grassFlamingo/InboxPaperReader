const BaseParser = require('./base');

class GenericParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;

    const cleaned = this.cleanHtml(html);
    const title = this.extractTitle(cleaned) || url;
    const authors = this.extractAuthors(cleaned);
    const description = this.extractDescription(cleaned);

    const mainContent = this.extractMainContent(cleaned);
    const content = this.parseContentBlocks(mainContent);

    const featuredImage = this.extractFeaturedImage(cleaned);
    if (featuredImage) {
      this.media.images.push({
        url: featuredImage.url,
        path: null,
        in_main: false,
        is_featured: true
      });
    }

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

module.exports = new GenericParser();