const BaseParser = require('./base');
const { resolveUrl } = require('./utils');

class TwitterParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;

    const cleaned = this.cleanHtml(html);

    const mainContent = this.extractTwitterContent(cleaned);
    const content = this.parseContentBlocks(mainContent);

    const avatar = cleaned.match(/<img[^>]+alt=["']([^"']+)["'][^>]+class=["'][^"']*avatar[^"']*["'][^>]*src=["']([^"']+)["']/i);
    if (avatar) {
      await this.downloadMedia(resolveUrl(this.url, avatar[2]), 'images', 0);
      if (this.media.images.length > 0) {
        this.media.images[0].is_featured = true;
      }
    }

    return {
      title: this.extractTitle(cleaned) || 'Twitter Thread',
      authors: this.extractAuthors(cleaned),
      content,
      images: this.media.images,
      videos: this.media.videos,
      audios: this.media.audios,
    };
  }

  extractTwitterContent(html) {
    const patterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+role=["'][^"']*article[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+data-testid=["']tweet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 50) {
        return match[1];
      }
    }

    return this.extractMainContent(html);
  }
}

module.exports = new TwitterParser();