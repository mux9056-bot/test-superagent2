import fs from 'node:fs';
import path from 'node:path';
import { ContentValidationError, loadContent, selectPosts } from './content.mjs';
import { renderMarkdown } from './markdown.mjs';
import {
  renderAboutPage,
  renderArchivesPage,
  renderHomePage,
  renderNotFoundPage,
  renderPostPage,
  renderTagPage,
  renderTagsPage,
} from './render.mjs';
import {
  absoluteUrl,
  collectTags,
  compareOldestFirst,
  encodedTagPath,
  escapeXml,
  isExternalHref,
  localToday,
  neighboursOf,
  normalizeRoutePath,
  paginate,
  readImageDimensions,
  sortNewestFirst,
} from './utils.mjs';

function readCss(rootDir) {
  const file = path.join(rootDir, 'styles', 'global.css');
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function isLocalImage(src) {
  return src.startsWith('/') && !isExternalHref(src);
}

function checkReferences({ documents, routes, publicDir, draftRoutes }) {
  const errors = [];

  for (const document of documents) {
    for (const image of document.images) {
      if (!image.alt.trim()) {
        errors.push(
          `${document.file}${image.line ? `：第 ${image.line} 行` : ''}图片缺少替代文本 alt：${image.src}`,
        );
      }
      if (isExternalHref(image.src)) continue;
      if (!isLocalImage(image.src)) {
        errors.push(
          `${document.file}${image.line ? `：第 ${image.line} 行` : ''}图片地址需以 / 开头（相对于站点根目录）：${image.src}`,
        );
        continue;
      }
      const decoded = decode(image.src.split('#')[0].split('?')[0]);
      const filePath = decoded
        ? path.join(publicDir, decoded.replace(/^\/+/, ''))
        : null;
      if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        errors.push(
          `${document.file}${image.line ? `：第 ${image.line} 行` : ''}图片不存在：${image.src}（应放在 public 目录）`,
        );
      }
    }

    for (const link of document.links) {
      const href = link.href.trim();
      const where = `${document.file}${link.line ? `：第 ${link.line} 行` : ''}`;
      if (!href) {
        errors.push(`${where}链接地址为空`);
        continue;
      }
      if (
        href.startsWith('#') ||
        isExternalHref(href) ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        continue;
      }
      if (!href.startsWith('/')) {
        errors.push(`${where}站内链接需以 / 开头（相对于站点根目录）：${href}`);
        continue;
      }

      const withoutHash = href.split('#')[0].split('?')[0];
      const decoded = decode(withoutHash);
      if (!decoded) {
        errors.push(`${where}链接包含无法解析的转义字符：${href}`);
        continue;
      }
      const target = normalizeRoutePath(decoded);

      if (routes.has(target)) continue;

      const publicFile = path.join(publicDir, target.replace(/^\/+/, ''));
      if (fs.existsSync(publicFile) && fs.statSync(publicFile).isFile()) continue;

      if (draftRoutes.has(target)) {
        errors.push(`${where}链接指向草稿文章，正式构建会排除草稿：${href}`);
      } else {
        errors.push(`${where}站内链接指向不存在的页面：${href}`);
      }
    }
  }

  return errors;
}

function renderRss({ site, posts }) {
  const items = sortNewestFirst(posts)
    .slice(0, site.rssLimit)
    .map((post) => {
      const link = absoluteUrl(site, `/posts/${post.slug}/`);
      const pubDate = new Date(`${post.date}T00:00:00Z`).toUTCString();
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(post.description)}</description>
    </item>`;
    })
    .join('\n');

  const newest = sortNewestFirst(posts)[0];
  const lastBuildDate = newest
    ? new Date(`${newest.date}T00:00:00Z`).toUTCString()
    : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(site.name)}</title>
    <link>${escapeXml(absoluteUrl(site, '/'))}</link>
    <description>${escapeXml(site.description)}</description>
    <language>${escapeXml(site.language)}</language>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
    <atom:link href="${escapeXml(absoluteUrl(site, '/rss.xml'))}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;
}

function renderSitemap({ site, posts, pageCount, tags }) {
  const entries = [{ loc: absoluteUrl(site, '/') }];
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    entries.push({ loc: absoluteUrl(site, `/page/${pageNumber}/`) });
  }
  for (const post of sortNewestFirst(posts)) {
    entries.push({
      loc: absoluteUrl(site, `/posts/${post.slug}/`),
      lastmod: post.updated || post.date,
    });
  }
  entries.push({ loc: absoluteUrl(site, '/archives/') });
  entries.push({ loc: absoluteUrl(site, '/tags/') });
  for (const tag of tags) {
    entries.push({ loc: absoluteUrl(site, encodedTagPath(tag.name)) });
  }
  entries.push({ loc: absoluteUrl(site, '/about/') });

  const urls = entries
    .map(
      (entry) =>
        `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>${
          entry.lastmod ? `\n    <lastmod>${entry.lastmod}</lastmod>` : ''
        }\n  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function renderRobots({ site }) {
  return `User-agent: *
Allow: /

Sitemap: ${absoluteUrl(site, '/sitemap.xml')}
`;
}

function copyDirectory(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(source, target);
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target);
    }
  }
}

function routeToFilePath(outDir, route) {
  if (route.endsWith('/')) return path.join(outDir, route, 'index.html');
  return path.join(outDir, route.replace(/^\//, ''));
}

function assertSafeOutDir(rootDir, outDir) {
  const root = path.resolve(rootDir);
  const out = path.resolve(outDir);
  if (out === root || !out.startsWith(`${root}${path.sep}`)) {
    throw new Error(`输出目录必须位于项目目录内：${out}`);
  }
}

/**
 * 构建整站：读取内容、校验、渲染 HTML/RSS/站点地图，并写入 outDir。
 * write=false 时只做校验与渲染，用于 npm run check。
 */
export function buildSite({
  site,
  rootDir = process.cwd(),
  contentDir = path.join(rootDir, 'content'),
  publicDir = path.join(rootDir, 'public'),
  outDir = path.join(rootDir, 'dist'),
  includeDrafts = false,
  write = true,
}) {
  const today = localToday();
  const { posts, about, warnings } = loadContent({ contentDir, today });

  const drafts = posts.filter((post) => post.draft);
  const selected = selectPosts(posts, { includeDrafts });
  const timeline = sortNewestFirst(selected);
  const publishedTimeline = timeline.filter((post) => !post.draft);

  const renderedPosts = new Map();
  for (const post of selected) {
    renderedPosts.set(
      post.slug,
      renderMarkdown(post.content, { publicDir, base: site.base }),
    );
  }
  const renderedAbout = renderMarkdown(about.content, { publicDir, base: site.base });

  const perPage = Math.max(1, site.postsPerPage);
  const pageCount = Math.max(1, Math.ceil(timeline.length / perPage));
  const tags = collectTags(timeline);
  const publishedTags = collectTags(publishedTimeline);

  const routes = new Set(['/', '/archives/', '/tags/', '/about/', '/rss.xml', '/sitemap.xml', '/robots.txt']);
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    routes.add(`/page/${pageNumber}/`);
  }
  for (const post of timeline) routes.add(`/posts/${post.slug}/`);
  for (const tag of tags) routes.add(`/tags/${tag.name}/`);

  const draftRoutes = new Set(drafts.map((post) => `/posts/${post.slug}/`));

  const documents = [
    ...selected.map((post) => ({
      file: post.file,
      links: renderedPosts.get(post.slug).links,
      images: renderedPosts.get(post.slug).images,
    })),
    { file: about.file, links: renderedAbout.links, images: renderedAbout.images },
  ];

  const referenceErrors = checkReferences({
    documents,
    routes,
    publicDir,
    draftRoutes,
  });

  let avatar = null;
  if (about.avatar) {
    const decoded = decode(about.avatar);
    const avatarPath = decoded
      ? path.join(publicDir, decoded.replace(/^\/+/, ''))
      : null;
    if (!avatarPath || !fs.existsSync(avatarPath)) {
      referenceErrors.push(`${about.file}：字段 avatar 指向的图片不存在：${about.avatar}`);
    } else {
      avatar = { src: about.avatar, ...(readImageDimensions(avatarPath) ?? {}) };
    }
  }

  if (referenceErrors.length) throw new ContentValidationError(referenceErrors, warnings);

  const css = readCss(rootDir);
  const pages = [];

  pages.push({
    route: '/',
    html: renderHomePage({
      site,
      posts: timeline.slice(0, perPage),
      pageNumber: 1,
      totalPages: pageCount,
      css,
    }),
  });
  for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
    pages.push({
      route: `/page/${pageNumber}/`,
      html: renderHomePage({
        site,
        posts: timeline.slice((pageNumber - 1) * perPage, pageNumber * perPage),
        pageNumber,
        totalPages: pageCount,
        css,
      }),
    });
  }

  const chronological = [...timeline].sort(compareOldestFirst);
  chronological.forEach((post, index) => {
    const { previous, next } = neighboursOf(chronological, index);
    pages.push({
      route: `/posts/${post.slug}/`,
      html: renderPostPage({
        site,
        post,
        previous,
        next,
        contentHtml: renderedPosts.get(post.slug).html,
        css,
      }),
    });
  });

  pages.push({
    route: '/archives/',
    html: renderArchivesPage({ site, posts: timeline, css }),
  });
  pages.push({
    route: '/tags/',
    html: renderTagsPage({ site, tags, css }),
  });
  for (const tag of tags) {
    pages.push({
      route: encodedTagPath(tag.name),
      html: renderTagPage({
        site,
        tag: tag.name,
        posts: timeline.filter((post) => post.tags.includes(tag.name)),
        css,
      }),
    });
  }
  pages.push({
    route: '/about/',
    html: renderAboutPage({
      site,
      about,
      avatar,
      contentHtml: renderedAbout.html,
      css,
    }),
  });
  pages.push({
    route: '/404.html',
    html: renderNotFoundPage({ site, css }),
  });

  const rss = renderRss({ site, posts: publishedTimeline });
  const sitemap = renderSitemap({ site, posts: publishedTimeline, pageCount, tags: publishedTags });
  const robots = renderRobots({ site });

  if (write) {
    assertSafeOutDir(rootDir, outDir);
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(outDir, { recursive: true });
    copyDirectory(publicDir, outDir);
    for (const page of pages) {
      // 页面地址中的标签使用百分号编码，写入文件系统时还原为可读目录名。
      const filePath = routeToFilePath(outDir, decode(page.route) ?? page.route);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, page.html);
    }
    fs.writeFileSync(path.join(outDir, 'rss.xml'), rss);
    fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap);
    fs.writeFileSync(path.join(outDir, 'robots.txt'), robots);
    fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
  }

  return {
    pages,
    routes: [...routes],
    rss,
    sitemap,
    robots,
    stats: {
      published: publishedTimeline.length,
      drafts: drafts.length,
      includedDrafts: timeline.length - publishedTimeline.length,
      tags: tags.length,
      homePages: pageCount,
    },
    warnings,
  };
}
