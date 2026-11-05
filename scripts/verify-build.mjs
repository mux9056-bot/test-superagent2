import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { site } from '../site.config.mjs';
import { loadContent, selectPosts } from '../lib/content.mjs';
import {
  absoluteUrl,
  collectTags,
  encodedTagPath,
  sortNewestFirst,
} from '../lib/utils.mjs';

const outDir = path.resolve(process.argv[2] ?? 'dist');
const base = site.base;
const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`PASS ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function stripBase(value) {
  if (!base) return value;
  if (value === base) return '/';
  if (value.startsWith(`${base}/`)) return value.slice(base.length);
  return value;
}

function read(relativePath) {
  const filePath = path.join(outDir, relativePath);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function collectHtml(dir, bucket = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectHtml(filePath, bucket);
    else if (entry.isFile() && entry.name.endsWith('.html')) bucket.push(filePath);
  }
  return bucket;
}

function collectTextFiles(dir, bucket = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTextFiles(filePath, bucket);
    else if (/\.(html|xml|txt)$/.test(entry.name)) bucket.push(filePath);
  }
  return bucket;
}

if (!fs.existsSync(outDir)) {
  console.error(`输出目录不存在：${outDir}，请先运行 npm run build`);
  process.exit(1);
}

const { posts, about } = loadContent({ contentDir: path.join(process.cwd(), 'content') });
const published = sortNewestFirst(selectPosts(posts));
const drafts = posts.filter((post) => post.draft);
const tags = collectTags(published);
const perPage = site.postsPerPage;
const pageCount = Math.ceil(published.length / perPage);
const homePages = Math.max(1, pageCount);

const home = read('index.html');
check('首页存在', Boolean(home));
check('首页包含站名', Boolean(home && home.includes(`<title>${site.name}</title>`)));
check(
  '首页显示站名、介绍和导航',
  Boolean(home && home.includes(site.name) && home.includes(site.description) && home.includes('主导航')),
);
check('首页文章数为每页上限', (home?.match(/class="post-item"/g) ?? []).length === Math.min(perPage, published.length));

const homeOrder = [...(home?.matchAll(/class="post-item-title"><a href="([^"]+)"/g) ?? [])].map((match) =>
  stripBase(match[1]),
);
const expectedFirstPage = published.slice(0, perPage).map((post) => `/posts/${post.slug}/`);
check('首页文章按发布日期倒序（同日按 slug）', JSON.stringify(homeOrder) === JSON.stringify(expectedFirstPage));

check('首页分页链接到第 2 页', Boolean(home && home.includes(`href="${base}/page/2/"`)));
check('首页包含分页状态', Boolean(home && home.includes(`第 1 / ${homePages} 页`)));

const secondPage = read('page/2/index.html');
check('第 2 页存在', Boolean(secondPage));
const secondOrder = [...(secondPage?.matchAll(/class="post-item-title"><a href="([^"]+)"/g) ?? [])].map((match) =>
  stripBase(match[1]),
);
const expectedSecondPage = published.slice(perPage, perPage * 2).map((post) => `/posts/${post.slug}/`);
check('第 2 页文章无重复或遗漏', JSON.stringify(secondOrder) === JSON.stringify(expectedSecondPage));
check('第 2 页有上一页链接', Boolean(secondPage && secondPage.includes('rel="prev"')));
check('最后一页没有下一页链接', Boolean(secondPage && !secondPage.includes('rel="next"')));

for (const post of published) {
  const page = read(`posts/${post.slug}/index.html`);
  check(`文章页存在：${post.slug}`, Boolean(page));
  if (!page) continue;
  check(`文章页标题：${post.slug}`, page.includes(`<h1 class="post-title">${post.title}</h1>`));
  check(`文章页日期：${post.slug}`, page.includes(`<time datetime="${post.date}">`));
  check(
    `文章页 canonical：${post.slug}`,
    page.includes(`<link rel="canonical" href="${absoluteUrl(site, `/posts/${post.slug}/`)}">`),
  );
  check(
    `文章页 description 与 OG：${post.slug}`,
    page.includes(`<meta name="description" content="${post.description}">`) &&
      page.includes(`<meta property="og:title" content="${post.title}">`),
  );
  check(
    `文章页类型为 article：${post.slug}`,
    page.includes('<meta property="og:type" content="article">'),
  );
  if (post.updated && post.updated !== post.date) {
    check(
      `文章页显示更新时间：${post.slug}`,
      page.includes(`更新于 <time datetime="${post.updated}">`),
    );
  } else {
    check(`文章页不显示多余更新时间：${post.slug}`, !page.includes('class="post-updated"'));
  }
}

const richPost = read('posts/why-i-write-again/index.html');
check('示例文章包含标题层级', Boolean(richPost && /<h2 id="为什么又开始写">/.test(richPost)));
check('示例文章包含引用', Boolean(richPost && richPost.includes('<blockquote>')));
check('示例文章包含列表', Boolean(richPost && richPost.includes('<ul>') && richPost.includes('<ol>')));
check('示例文章包含代码块', Boolean(richPost && richPost.includes('<pre class="code-block">')));
check('示例文章包含表格滚动容器', Boolean(richPost && richPost.includes('class="table-wrap"')));
check('示例文章包含带说明的图片', Boolean(richPost && richPost.includes('<figure class="post-figure">') && richPost.includes('<figcaption>')));
check('示例文章图片带宽高', Boolean(richPost && /<img [^>]*width="1200" height="800"/.test(richPost)));
check('示例文章包含分隔线', Boolean(richPost && richPost.includes('<hr>')));

const oldest = published[published.length - 1];
const oldestPage = read(`posts/${oldest.slug}/index.html`);
check('最早文章没有上一篇', Boolean(oldestPage && !oldestPage.includes('post-neighbour-previous')));
check('最早文章有下一篇', Boolean(oldestPage && oldestPage.includes('post-neighbour-next')));

const middle = published[3];
const middlePage = read(`posts/${middle.slug}/index.html`);
check('中间文章同时有上一篇和下一篇', Boolean(middlePage && middlePage.includes('post-neighbour-previous') && middlePage.includes('post-neighbour-next')));

const archives = read('archives/index.html');
check('归档页存在', Boolean(archives));
check('归档页显示文章总数', Boolean(archives && archives.includes(`共 ${published.length} 篇文章`)));
check(
  '归档页按年份分组',
  Boolean(archives && ['2026 年', '2025 年'].every((year) => archives.includes(year))),
);
check(
  '归档页包含全部已发布文章',
  Boolean(archives && published.every((post) => archives.includes(post.title))),
);

const tagsPage = read('tags/index.html');
check('标签页存在', Boolean(tagsPage));
check('标签页显示标签数量', Boolean(tagsPage && tagsPage.includes(`共 ${tags.length} 个标签`)));
const tagOrder = [...(tagsPage?.matchAll(/class="tag-index-name" href="([^"]+)"/g) ?? [])].map((match) =>
  stripBase(decodeURIComponent(match[1])),
);
check(
  '标签列表按名称排序',
  JSON.stringify(tagOrder) === JSON.stringify(tags.map((tag) => `/tags/${tag.name}/`)),
);

for (const tag of tags) {
  const page = read(`tags/${tag.name}/index.html`);
  check(`标签页存在：${tag.name}`, Boolean(page));
  check(
    `标签页文章数量：${tag.name}`,
    Boolean(page && page.includes(`共 ${tag.count} 篇文章`)),
  );
}

const aboutPage = read('about/index.html');
check('关于页存在', Boolean(aboutPage));
check('关于页显示 Markdown 内容', Boolean(aboutPage && aboutPage.includes('为什么写博客')));
check('关于页显示头像', Boolean(aboutPage && aboutPage.includes('about-avatar')));

const notFound = read('404.html');
check('404 页面存在', Boolean(notFound));
check('404 页面说明与入口', Boolean(notFound && notFound.includes('页面不存在') && notFound.includes('返回首页')));
check('404 页面 noindex', Boolean(notFound && notFound.includes('name="robots" content="noindex')));
check('404 页面没有 canonical', Boolean(notFound && !notFound.includes('rel="canonical"')));

const rss = read('rss.xml');
check('RSS 存在', Boolean(rss));
const rssItems = [...(rss?.matchAll(/<item>([\s\S]*?)<\/item>/g) ?? [])].map((match) => match[1]);
check('RSS 条目数不超过上限', rssItems.length === Math.min(site.rssLimit, published.length));
check('RSS 最新文章在前', Boolean(rssItems[0]?.includes(`<title>${published[0].title}</title>`)));
check(
  'RSS 链接使用站点域名',
  rssItems.every((item) => item.includes(`<link>${absoluteUrl(site, `/posts/`)}`)),
);
check(
  'RSS 条目包含日期与摘要',
  rssItems.every((item) => item.includes('<pubDate>') && item.includes('<description>')),
);

const sitemap = read('sitemap.xml');
check('站点地图存在', Boolean(sitemap));
const locs = [...(sitemap?.matchAll(/<loc>([^<]+)<\/loc>/g) ?? [])].map((match) => match[1]);
check(
  '站点地图包含全部已发布文章',
  published.every((post) => locs.includes(absoluteUrl(site, `/posts/${post.slug}/`))),
);
check('站点地图包含首页、归档、标签、关于', ['/', '/archives/', '/tags/', '/about/'].every((route) => locs.includes(absoluteUrl(site, route))));
check(
  '站点地图包含标签页',
  tags.every((tag) => locs.includes(absoluteUrl(site, encodedTagPath(tag.name)))),
);
check(
  '站点地图不含 404 与草稿',
  locs.every((loc) => !loc.includes('404') && drafts.every((draft) => !loc.includes(draft.slug))),
);
check(
  '站点地图为文章提供 lastmod',
  published.every((post) =>
    sitemap.includes(`<loc>${absoluteUrl(site, `/posts/${post.slug}/`)}</loc>\n    <lastmod>${post.updated || post.date}</lastmod>`),
  ),
);

const robots = read('robots.txt');
check('robots.txt 指向站点地图', Boolean(robots && robots.includes(`Sitemap: ${absoluteUrl(site, '/sitemap.xml')}`)));

const textFiles = collectTextFiles(outDir).map((file) => fs.readFileSync(file, 'utf8'));
check(
  '草稿标题未出现在正式产物中',
  textFiles.every((content) => drafts.every((draft) => !content.includes(draft.title))),
);
check(
  '草稿链接未出现在正式产物中',
  textFiles.every((content) => drafts.every((draft) => !content.includes(`/posts/${draft.slug}/`))),
);

const htmlFiles = collectHtml(outDir);
check('页面数量符合预期', htmlFiles.length === homePages + published.length + 1 + 1 + tags.length + 1 + 1);

let canonicalProblems = 0;
let linkProblems = 0;
let langProblems = 0;
const allowedFiles = new Set(['/rss.xml', '/sitemap.xml', '/robots.txt', '/favicon.svg', '/og-default.png']);

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const relative = path.relative(outDir, file).split(path.sep).join('/');
  const canonicalCount = (html.match(/rel="canonical"/g) ?? []).length;
  if (relative !== '404.html' && canonicalCount !== 1) {
    canonicalProblems += 1;
    console.log(`  canonical 数量异常：${relative}（${canonicalCount}）`);
  }
  if (!html.includes('<html lang="zh-CN">')) {
    langProblems += 1;
    console.log(`  lang 缺失：${relative}`);
  }

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const value = stripBase(match[1]);
    if (
      !value.startsWith('/') ||
      value.startsWith('//') ||
      value.startsWith('/#') ||
      value === ''
    ) {
      continue;
    }
    const clean = decodeURIComponent(value.split('#')[0].split('?')[0]);
    if (allowedFiles.has(clean)) continue;
    let filePath = path.join(outDir, clean.replace(/^\/+/, ''));
    if (clean.endsWith('/')) filePath = path.join(filePath, 'index.html');
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      linkProblems += 1;
      console.log(`  内部链接无法解析：${relative} → ${value}`);
    }
  }
}

check('每个页面只有一个 canonical（404 除外）', canonicalProblems === 0);
check('每个页面声明 lang="zh-CN"', langProblems === 0);
check('所有站内链接与资源均可解析', linkProblems === 0);
check('没有指向 /page/1/ 的链接', textFiles.every((content) => !content.includes('/page/1/')));

check('.nojekyll 存在', fs.existsSync(path.join(outDir, '.nojekyll')));
check('favicon 存在', fs.existsSync(path.join(outDir, 'favicon.svg')));
check('默认分享图存在', fs.existsSync(path.join(outDir, 'og-default.png')));
check('关于页 front matter 声明的头像已复制', fs.existsSync(path.join(outDir, about.avatar.replace(/^\/+/, ''))));

console.log(`\n${checks} 项检查，${failures.length} 项失败。`);
if (failures.length) {
  console.error('构建产物校验失败：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('构建产物校验通过。');
