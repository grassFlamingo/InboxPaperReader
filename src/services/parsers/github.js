const BaseParser = require('./base');

class GithubParser extends BaseParser {
  async parse(url, html, importId) {
    this.url = url;
    this.importId = importId;

    const cleaned = this.cleanHtml(html);

    const title = this.extractGithubTitle(cleaned);
    const description = this.extractGithubDescription(cleaned);
    const mainContent = this.extractGithubContent(cleaned);
    const content = this.parseContentBlocks(mainContent);

    return {
      title,
      authors: '',
      content,
      images: this.media.images,
      videos: this.media.videos,
      audios: this.media.audios,
    };
  }

  extractGithubTitle(html) {
    const h1 = html.match(/<h1[^>]+class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/h1>/i);
    if (h1) return h1[1].trim();

    const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    if (og) return og[1].trim();

    return this.extractTitle(html);
  }

  extractGithubDescription(html) {
    const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (meta) return meta[1].trim();

    const og = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (og) return og[1].trim();

    return this.extractDescription(html);
  }

  extractGithubContent(html) {
    const patterns = [
      /<article[^>]+class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+class=["'][^"']*markdown-body[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id=["']readme[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
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

module.exports = new GithubParser();