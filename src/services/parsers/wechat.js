const BaseParser = require('./base');
const { resolveUrl } = require('./utils');

class WechatParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;

    const title = this.extractWechatTitle(html);
    const author = this.extractWechatAuthor(html);

    const cleaned = this.cleanHtml(html);
    const mainContent = this.extractWechatContent(cleaned);
    const content = this.parseContentBlocks(mainContent);

    const featuredImage = this.extractFeaturedImage(cleaned);
    if (featuredImage) {
      const featuredPath = await this.downloadMedia(resolveUrl(this.url, featuredImage.url), 'images', 0);
      if (featuredPath) {
        this.media.images[0].is_featured = true;
      }
    }

    const mediaUrls = this.extractMediaUrls(mainContent);
    const contentImages = mediaUrls.images.slice(0, 10);
    for (let i = 0; i < contentImages.length && this.media.images.length < 10; i++) {
      await this.downloadMedia(contentImages[i], 'images', this.media.images.length);
    }

    return {
      title,
      authors: author,
      content,
      images: this.media.images,
      videos: this.media.videos,
      audios: this.media.audios,
    };
  }

  extractWechatTitle(html) {
    const match = html.match(/<h1[^>]+id="activity-name"[^>]*>([^<]+)<\/h1>/i);
    if (match) return match[1].trim();

    const title1 = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (title1) return title1[1].trim();

    return this.extractTitle(html);
  }

  extractWechatAuthor(html) {
    const match = html.match(/<span[^>]+id="js_name"[^>]*>([^<]+)<\/span>/i);
    if (match) return match[1].trim();

    const author = html.match(/<a[^>]+data-type="author"[^>]*>([^<]+)<\/a>/i);
    if (author) return author[1].trim();

    return this.extractAuthors(html);
  }

  extractWechatContent(html) {
    const patterns = [
      /<div[^>]+id="js_content"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*rich_media_content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+class=["'][^"']*js_abstract[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1] && match[1].length > 100) {
        return match[1];
      }
    }

    return this.extractMainContent(html);
  }
}

module.exports = new WechatParser();