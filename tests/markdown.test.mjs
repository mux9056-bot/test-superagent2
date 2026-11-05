import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { renderMarkdown } from '../lib/markdown.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(projectRoot, 'public');

function render(markdown, options = {}) {
  return renderMarkdown(markdown, { publicDir, ...options });
}

test('标题生成稳定、唯一的锚点', () => {
  const { html } = render('## 标题\n\n正文\n\n## 标题\n\n更多正文');
  assert.match(html, /<h2 id="标题">/);
  assert.match(html, /<h2 id="标题-1">/);
});

test('表格包在可横向滚动的容器里', () => {
  const { html } = render('| 列一 | 列二 |\n| --- | --- |\n| 1 | 2 |');
  assert.match(html, /<div class="table-wrap" role="region" aria-label="表格" tabindex="0"><table>/);
  assert.match(html, /<\/table><\/div>/);
});

test('代码块高亮与未知语言转义', () => {
  const { html } = render('```js\nconst answer = 42;\n```');
  assert.match(html, /<pre class="code-block"><code class="hljs language-js">/);
  assert.match(html, /hljs-keyword/);

  const { html: unknown } = render('```nope\n<script>alert(1)</script>\n```');
  assert.match(unknown, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(unknown, /<script>alert/);
});

test('正文中的原始 HTML 不会被当成标签执行', () => {
  const { html } = render('一段 <b>不是加粗</b> 的文字');
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /<b>/);
});

test('图片输出宽高，首张立即加载、其余延迟加载', () => {
  const { html, images } = render(
    '![树](/images/desk/desk.jpg)\n\n![头像](/images/avatar/avatar.png)',
  );
  assert.match(
    html,
    /<img src="\/images\/desk\/desk.jpg" alt="树" width="1200" height="800" loading="eager" decoding="async">/,
  );
  assert.match(
    html,
    /<img src="\/images\/avatar\/avatar.png" alt="头像" width="240" height="240" loading="lazy" decoding="async">/,
  );
  assert.deepEqual(
    images.map((image) => image.src),
    ['/images/desk/desk.jpg', '/images/avatar/avatar.png'],
  );
});

test('带说明的独立图片生成 figure 与 figcaption', () => {
  const { html } = render('![海](/images/sea/beach.jpg "五月的海")');
  assert.match(html, /<figure class="post-figure"><img [^>]*><figcaption>五月的海<\/figcaption><\/figure>/);
  assert.doesNotMatch(html, /title="五月的海"/);
});

test('图片与站内链接会带上部署子路径', () => {
  const { html } = render('![图](/images/avatar/avatar.png)\n\n[关于](/about/)', { base: '/blog' });
  assert.match(html, /src="\/blog\/images\/avatar\/avatar.png"/);
  assert.match(html, /<a href="\/blog\/about\/">关于<\/a>/);
});

test('收集站内链接而保留原始地址，供构建校验', () => {
  const { html, links } = render('第一段\n\n[站内](/posts/a-post/)\n\n[外部](https://example.com/x)\n\n[锚点](#小节)');
  assert.deepEqual(
    links.map((link) => link.href),
    ['/posts/a-post/', 'https://example.com/x', `#${encodeURIComponent('小节')}`],
  );
  assert.ok(links[0].line >= 1);
  assert.match(html, /href="\/posts\/a-post\/"/);
  assert.match(html, /href="https:\/\/example.com\/x"/);
});

test('列表与引用正常渲染', () => {
  const { html } = render('- 一\n- 二\n\n1. 甲\n2. 乙\n\n> 引用一句话');
  assert.match(html, /<ul>\n<li>一<\/li>/);
  assert.match(html, /<ol>\n<li>甲<\/li>/);
  assert.match(html, /<blockquote>\n<p>引用一句话<\/p>\n<\/blockquote>/);
});
