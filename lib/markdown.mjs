import fs from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import GithubSlugger from 'github-slugger';
import hljs from 'highlight.js';
import {
  escapeAttr,
  escapeHtml,
  isExternalHref,
  readImageDimensions,
  withBase,
} from './utils.mjs';

function highlightCode(code, language) {
  const lang = (language || '').trim().toLowerCase();
  if (lang && hljs.getLanguage(lang)) {
    try {
      const { value } = hljs.highlight(code, { language: lang, ignoreIllegals: true });
      return `<pre class="code-block"><code class="hljs language-${escapeAttr(lang)}">${value}</code></pre>`;
    } catch {
      // 落到转义后的纯文本，构建不因高亮失败而中断。
    }
  }
  return `<pre class="code-block"><code class="hljs">${escapeHtml(code)}</code></pre>`;
}

/**
 * 渲染 Markdown 正文，同时收集站内链接与图片引用供构建校验，
 * 并为本地图片补上宽高等属性、为独立图片生成带说明的 figure。
 */
export function renderMarkdown(markdown, { publicDir, base = '' } = {}) {
  const slugger = new GithubSlugger();
  const imageSizeCache = new Map();

  const md = new MarkdownIt({
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
    highlight: highlightCode,
  });

  md.use(anchor, {
    slugify: (value) => slugger.slug(value.trim()),
    level: [1, 2, 3, 4, 5, 6],
    tabIndex: false,
    permalink: false,
  });

  md.core.ruler.push('standalone_figure', (state) => {
    const tokens = state.tokens;
    for (let index = 0; index + 2 < tokens.length; index += 1) {
      if (tokens[index].type !== 'paragraph_open') continue;
      const inline = tokens[index + 1];
      const close = tokens[index + 2];
      if (!inline || inline.type !== 'inline' || !close || close.type !== 'paragraph_close') {
        continue;
      }
      const children = (inline.children || []).filter(
        (token) => !(token.type === 'text' && /^\s*$/.test(token.content)),
      );
      if (children.length !== 1 || children[0].type !== 'image') continue;
      const title = children[0].attrGet('title');
      if (!title) continue;
      tokens[index].type = 'figure_open';
      tokens[index].tag = 'figure';
      tokens[index].attrSet('class', 'post-figure');
      close.type = 'figure_close';
      close.tag = 'figure';
      const caption = new state.Token('html_block', '', 0);
      caption.content = `<figcaption>${escapeHtml(title)}</figcaption>`;
      tokens.splice(index + 2, 0, caption);
      index += 3;
    }
  });

  md.renderer.rules.table_open = () =>
    '<div class="table-wrap" role="region" aria-label="表格" tabindex="0"><table>';
  md.renderer.rules.table_close = () => '</table></div>';

  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const href = token.attrGet('href') || '';
    env.links.push({ href, line: env.currentLine });
    if (!isExternalHref(href) && href.startsWith('/')) {
      token.attrSet('href', withBase(base, href));
    }
    return self.renderToken(tokens, index, options);
  };

  md.renderer.rules.image = (tokens, index, options, env) => {
    const token = tokens[index];
    const src = token.attrGet('src') || '';
    const alt = token.content || '';
    const external = isExternalHref(src);
    let dimensions = null;
    if (!external && src.startsWith('/') && publicDir) {
      const clean = src.split('#')[0].split('?')[0];
      if (!imageSizeCache.has(clean)) {
        try {
          const filePath = path.join(publicDir, decodeURIComponent(clean).replace(/^\/+/, ''));
          imageSizeCache.set(clean, fs.existsSync(filePath) ? readImageDimensions(filePath) : null);
        } catch {
          imageSizeCache.set(clean, null);
        }
      }
      dimensions = imageSizeCache.get(clean);
    }
    const attrs = [
      `src="${escapeAttr(external ? src : withBase(base, src))}"`,
      `alt="${escapeAttr(alt)}"`,
    ];
    if (dimensions) attrs.push(`width="${dimensions.width}"`, `height="${dimensions.height}"`);
    if (env.firstImage) {
      attrs.push('loading="eager"');
      env.firstImage = false;
    } else {
      attrs.push('loading="lazy"');
    }
    attrs.push('decoding="async"');
    return `<img ${attrs.join(' ')}>`;
  };

  const env = { links: [], images: [], firstImage: true, currentLine: null };
  const tokens = md.parse(markdown, env);

  const links = [];
  const images = [];
  for (const token of tokens) {
    if (token.type !== 'inline' || !token.children) continue;
    const line = token.map ? token.map[0] + 1 : null;
    for (const child of token.children) {
      if (child.type === 'link_open') {
        links.push({ href: child.attrGet('href') || '', line });
      }
      if (child.type === 'image') {
        images.push({ src: child.attrGet('src') || '', alt: child.content || '', line });
      }
    }
  }

  // 行号只在渲染期供 link_open 使用，校验使用上面按 inline 块收集的结果。
  env.links = [];
  env.currentLine = null;
  env.firstImage = true;
  const html = md.renderer.render(tokens, md.options, env);

  return { html, links, images };
}
