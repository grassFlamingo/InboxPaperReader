const { fetchUrlText } = require('./web');
const { callLlm, cleanThinkTags } = require('./llm');

const WEB_CONTENT_TYPES = ['wechat_article', 'blog_post', 'twitter_thread', 'other'];

async function convertHtmlToMarkdown(url, htmlContent) {
  const systemPrompt = `你是一个HTML转Markdown的转换器。将给定的HTML内容转换为格式良好的Markdown。
要求：
1. 保留标题层级结构
2. 代码块使用\`\`\`标记
3. 列表保持原有结构
4. 保留加粗、斜体等格式
5. 图片使用![]()语法
6. 链接使用[]()语法
7. 移除不必要的HTML标签
8. 保持中文标点符号
9. 不要使用markdown代码块包裹整个内容
IMPORTANT: Do NOT use <think/> tags. Reply directly with Markdown only.`;

  try {
    const markdown = await callLlm(systemPrompt, `URL: ${url}\n\nHTML内容：\n${htmlContent}`, 2000);
    return cleanThinkTags(markdown);
  } catch (e) {
    console.error('[html2markdown] LLM conversion failed:', e.message);
    return null;
  }
}

async function processMarkdownConversion(paper) {
  if (!paper.source_url) return { done: 0, msg: null };
  
  const sourceType = paper.source_type || 'paper';
  if (!WEB_CONTENT_TYPES.includes(sourceType)) {
    return { done: 0, msg: 'not web content' };
  }

  if (paper.markdown_content && paper.markdown_content.length > 100) {
    return { done: 0, msg: 'already converted' };
  }

  console.log(`[MD-Convert] Converting #${paper.id}: ${paper.title?.substring(0, 30)}`);
  
  const htmlContent = await fetchUrlText(paper.source_url, 15000);
  if (!htmlContent || htmlContent.length < 100) {
    return { done: 0, msg: 'fetch failed' };
  }

  const markdown = await convertHtmlToMarkdown(paper.source_url, htmlContent);
  if (!markdown || markdown.length < 50) {
    return { done: 0, msg: 'convert failed' };
  }

  const db = require('../db/database');
  db.runQuery('UPDATE papers SET markdown_content = ? WHERE id = ?', [markdown, paper.id]);

  return { done: 1, msg: `${markdown.length} chars` };
}

module.exports = { convertHtmlToMarkdown, processMarkdownConversion, WEB_CONTENT_TYPES };
