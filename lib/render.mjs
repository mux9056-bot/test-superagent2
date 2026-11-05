import {
  absoluteUrl,
  encodedTagPath,
  escapeAttr,
  escapeHtml,
  formatDate,
  formatMonthDay,
  yearOf,
  withBase,
} from './utils.mjs';

export function homePagePath(pageNumber) {
  return pageNumber === 1 ? '/' : `/page/${pageNumber}/`;
}

export function postPath(post) {
  return `/posts/${post.slug}/`;
}

function navHtml(site, activeSection) {
  return site.nav
    .map((item) => {
      const href = withBase(site.base, item.path);
      const current = item.section === activeSection ? ' aria-current="page"' : '';
      return `<li><a href="${escapeAttr(href)}"${current}>${escapeHtml(item.label)}</a></li>`;
    })
    .join('\n          ');
}

function socialsHtml(site, socials) {
  if (!socials || socials.length === 0) return '';
  const items = socials
    .map(
      (social) =>
        `<li><a href="${escapeAttr(social.url)}">${escapeHtml(social.label)}</a></li>`,
    )
    .join('');
  return `<ul class="social-links" aria-label="联系方式">${items}</ul>`;
}

function tagsHtml(site, tags, label = '标签') {
  if (!tags || tags.length === 0) return '';
  const items = tags
    .map(
      (tag) =>
        `<li><a class="tag" href="${escapeAttr(withBase(site.base, encodedTagPath(tag)))}">${escapeHtml(tag)}</a></li>`,
    )
    .join('');
  return `<ul class="tag-list" aria-label="${escapeAttr(label)}">${items}</ul>`;
}

function draftBadge(post) {
  return post.draft ? '<span class="draft-badge">草稿</span>' : '';
}

function layout({
  site,
  title,
  description,
  path: pagePath,
  content,
  activeSection = null,
  ogType = 'website',
  ogImagePath = '/og-default.png',
  noindex = false,
  canonical = true,
  article = null,
  css = '',
}) {
  const pageTitle = title ? `${title} · ${site.name}` : site.name;
  const metaDescription = description || site.description;
  const canonicalUrl = canonical ? absoluteUrl(site, pagePath) : null;
  const ogImage = absoluteUrl(site, ogImagePath);
  const rssUrl = absoluteUrl(site, '/rss.xml');
  const favicon = withBase(site.base, '/favicon.svg');
  const year = new Date().getFullYear();

  const articleMeta = article
    ? [
        `<meta property="article:published_time" content="${article.date}T00:00:00+00:00">`,
        article.updated
          ? `<meta property="article:modified_time" content="${article.updated}T00:00:00+00:00">`
          : '',
        ...article.tags.map(
          (tag) => `<meta property="article:tag" content="${escapeAttr(tag)}">`,
        ),
      ]
        .filter(Boolean)
        .join('\n    ')
    : '';

  return `<!doctype html>
<html lang="${escapeAttr(site.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeAttr(metaDescription)}">
${canonicalUrl ? `<link rel="canonical" href="${escapeAttr(canonicalUrl)}">` : ''}
${noindex ? '<meta name="robots" content="noindex, follow">' : ''}
<meta property="og:site_name" content="${escapeAttr(site.name)}">
<meta property="og:locale" content="${escapeAttr(site.locale)}">
<meta property="og:type" content="${escapeAttr(ogType)}">
<meta property="og:title" content="${escapeAttr(title || site.name)}">
<meta property="og:description" content="${escapeAttr(metaDescription)}">
${canonicalUrl ? `<meta property="og:url" content="${escapeAttr(canonicalUrl)}">` : ''}
<meta property="og:image" content="${escapeAttr(ogImage)}">
${articleMeta}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title || site.name)}">
<meta name="twitter:description" content="${escapeAttr(metaDescription)}">
<meta name="twitter:image" content="${escapeAttr(ogImage)}">
<link rel="alternate" type="application/rss+xml" title="${escapeAttr(site.name)}" href="${escapeAttr(rssUrl)}">
<link rel="icon" href="${escapeAttr(favicon)}" type="image/svg+xml">
<meta name="theme-color" content="#faf8f3">
<style>
${css}
</style>
</head>
<body>
<a class="skip-link" href="#main">跳到正文</a>
<header class="site-header">
  <div class="wrap header-inner">
    <div class="site-identity">
      <a class="site-name" href="${escapeAttr(withBase(site.base, '/'))}">${escapeHtml(site.name)}</a>
      <p class="site-tagline">${escapeHtml(site.description)}</p>
    </div>
    <nav class="site-nav" aria-label="主导航">
      <ul>
        ${navHtml(site, activeSection)}
      </ul>
    </nav>
  </div>
</header>
<main id="main" class="site-main">
  <div class="wrap">
${content}
  </div>
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p class="copyright">© ${year} ${escapeHtml(site.name)}</p>
    <div class="footer-links">
      ${socialsHtml(site, site.socials)}
      <ul class="footer-nav" aria-label="订阅">
        <li><a href="${escapeAttr(withBase(site.base, '/rss.xml'))}">RSS</a></li>
      </ul>
    </div>
  </div>
</footer>
</body>
</html>
`;
}

export function renderHomePage({ site, posts, pageNumber, totalPages, css }) {
  const pagePath = homePagePath(pageNumber);
  const list = posts.length
    ? `<div class="post-list">\n${posts
        .map((post) => {
          const href = withBase(site.base, postPath(post));
          return `<article class="post-item">
  <h2 class="post-item-title"><a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a></h2>
  <p class="post-item-meta"><time datetime="${post.date}">${formatDate(post.date)}</time> ${draftBadge(post)}</p>
  <p class="post-item-summary"><a href="${escapeAttr(href)}">${escapeHtml(post.description)}</a></p>
  ${tagsHtml(site, post.tags, `${post.title} 的标签`)}
</article>`;
        })
        .join('\n')}
</div>`
    : `<p class="empty-state">这里还没有文章。可以先<a href="${escapeAttr(withBase(site.base, '/about/'))}">认识一下作者</a>。</p>`;

  const content = `<h1 class="page-heading">最新文章</h1>
${list}
${renderPagination({ site, pageNumber, totalPages })}`;

  return layout({
    site,
    title: pageNumber === 1 ? null : `第 ${pageNumber} 页`,
    description: site.description,
    path: pagePath,
    content,
    activeSection: 'home',
    css,
  });
}

function renderPagination({ site, pageNumber, totalPages }) {
  if (totalPages <= 1) return '';
  const previous =
    pageNumber > 1
      ? `<a class="pagination-link" rel="prev" href="${escapeAttr(withBase(site.base, homePagePath(pageNumber - 1)))}">← 上一页</a>`
      : '<span class="pagination-spacer" aria-hidden="true"></span>';
  const next =
    pageNumber < totalPages
      ? `<a class="pagination-link" rel="next" href="${escapeAttr(withBase(site.base, homePagePath(pageNumber + 1)))}">下一页 →</a>`
      : '<span class="pagination-spacer" aria-hidden="true"></span>';

  return `<nav class="pagination" aria-label="分页导航">
  ${previous}
  <span class="pagination-status">第 ${pageNumber} / ${totalPages} 页</span>
  ${next}
</nav>`;
}

export function renderPostPage({ site, post, previous, next, contentHtml, css }) {
  const previousHtml = previous
    ? `<a class="post-neighbour post-neighbour-previous" rel="prev" href="${escapeAttr(withBase(site.base, postPath(previous)))}"><span class="post-neighbour-label">上一篇</span><span class="post-neighbour-title">${escapeHtml(previous.title)}</span></a>`
    : '';
  const nextHtml = next
    ? `<a class="post-neighbour post-neighbour-next" rel="next" href="${escapeAttr(withBase(site.base, postPath(next)))}"><span class="post-neighbour-label">下一篇</span><span class="post-neighbour-title">${escapeHtml(next.title)}</span></a>`
    : '';
  const neighbours =
    previousHtml || nextHtml
      ? `<nav class="post-neighbours" aria-label="相邻文章">
  ${previousHtml}
  ${nextHtml}
</nav>`
      : '';

  const updatedNote =
    post.updated && post.updated !== post.date
      ? `<span class="post-updated">更新于 <time datetime="${post.updated}">${formatDate(post.updated)}</time></span>`
      : '';

  const content = `<article class="post">
  <header class="post-header">
    <h1 class="post-title">${escapeHtml(post.title)}</h1>
    <p class="post-meta">
      <time datetime="${post.date}">${formatDate(post.date)}</time>
      ${updatedNote}
      ${draftBadge(post)}
    </p>
    ${tagsHtml(site, post.tags, '文章标签')}
  </header>
  <div class="post-body">
${contentHtml}
  </div>
  <footer class="post-footer">
    <a class="back-home" href="${escapeAttr(withBase(site.base, '/'))}">← 返回首页</a>
    ${neighbours}
  </footer>
</article>`;

  return layout({
    site,
    title: post.title,
    description: post.description,
    path: postPath(post),
    content,
    ogType: 'article',
    article: post,
    css,
  });
}

export function renderArchivesPage({ site, posts, css }) {
  const groups = [];
  for (const post of posts) {
    const year = yearOf(post.date);
    let group = groups.find((item) => item.year === year);
    if (!group) {
      group = { year, posts: [] };
      groups.push(group);
    }
    group.posts.push(post);
  }

  const body = groups
    .map(
      (group) => `<section class="archive-year" aria-labelledby="year-${group.year}">
  <h2 id="year-${group.year}">${group.year} 年</h2>
  <ol class="archive-list">
    ${group.posts
      .map(
        (post) => `<li>
      <time datetime="${post.date}">${formatMonthDay(post.date)}</time>
      <a href="${escapeAttr(withBase(site.base, postPath(post)))}">${escapeHtml(post.title)}</a>
      ${draftBadge(post)}
    </li>`,
      )
      .join('\n    ')}
  </ol>
</section>`,
    )
    .join('\n');

  const content = `<h1 class="page-heading">归档</h1>
<p class="page-summary">共 ${posts.length} 篇文章</p>
${body || '<p class="empty-state">还没有已发布的文章。</p>'}`;

  return layout({
    site,
    title: '归档',
    description: `按年份浏览${site.name}的全部文章，共 ${posts.length} 篇。`,
    path: '/archives/',
    content,
    activeSection: 'archives',
    css,
  });
}

export function renderTagsPage({ site, tags, css }) {
  const list = tags.length
    ? `<ul class="tag-index">
${tags
  .map(
    (tag) => `  <li>
    <a class="tag-index-name" href="${escapeAttr(withBase(site.base, encodedTagPath(tag.name)))}">${escapeHtml(tag.name)}</a>
    <span class="tag-index-count">${tag.count} 篇</span>
  </li>`,
  )
  .join('\n')}
</ul>`
    : '<p class="empty-state">还没有标签。给文章加上 tags 后会出现在这里。</p>';

  const content = `<h1 class="page-heading">标签</h1>
<p class="page-summary">共 ${tags.length} 个标签</p>
${list}`;

  return layout({
    site,
    title: '标签',
    description: `${site.name}的所有文章标签，按名称排序。`,
    path: '/tags/',
    content,
    activeSection: 'tags',
    css,
  });
}

export function renderTagPage({ site, tag, posts, css }) {
  const list = `<div class="post-list">
${posts
  .map((post) => {
    const href = withBase(site.base, postPath(post));
    return `<article class="post-item">
  <h2 class="post-item-title"><a href="${escapeAttr(href)}">${escapeHtml(post.title)}</a></h2>
  <p class="post-item-meta"><time datetime="${post.date}">${formatDate(post.date)}</time> ${draftBadge(post)}</p>
  <p class="post-item-summary"><a href="${escapeAttr(href)}">${escapeHtml(post.description)}</a></p>
  ${tagsHtml(site, post.tags.filter((item) => item !== tag), '文章标签')}
</article>`;
  })
  .join('\n')}
</div>`;

  const content = `<h1 class="page-heading">标签：${escapeHtml(tag)}</h1>
<p class="page-summary">共 ${posts.length} 篇文章</p>
${list}`;

  return layout({
    site,
    title: `标签：${tag}`,
    description: `标签「${tag}」下的全部文章，共 ${posts.length} 篇。`,
    path: encodedTagPath(tag),
    content,
    activeSection: 'tags',
    css,
  });
}

export function renderAboutPage({ site, about, avatar, contentHtml, css }) {
  const avatarAttrs = avatar
    ? [
        `class="about-avatar"`,
        `src="${escapeAttr(withBase(site.base, about.avatar))}"`,
        `alt="${escapeAttr(`${about.title}的头像`)}"`,
        avatar.width ? `width="${avatar.width}"` : '',
        avatar.height ? `height="${avatar.height}"` : '',
        'loading="eager"',
        'decoding="async"',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  const avatarHtml = avatar ? `<img ${avatarAttrs}>` : '';
  const socials = socialsHtml(site, about.socials);

  const content = `<article class="about">
  <header class="about-header">
    ${avatarHtml}
    <div>
      <h1 class="page-heading">${escapeHtml(about.title)}</h1>
      ${socials}
    </div>
  </header>
  <div class="post-body about-body">
${contentHtml}
  </div>
</article>`;

  return layout({
    site,
    title: about.title,
    description: `关于${site.author}：个人简介、兴趣和写博客的原因。`,
    path: '/about/',
    content,
    activeSection: 'about',
    css,
  });
}

export function renderNotFoundPage({ site, css }) {
  const content = `<section class="not-found">
  <p class="not-found-code" aria-hidden="true">404</p>
  <h1>页面不存在</h1>
  <p>你访问的页面可能已被移动或删除。</p>
  <a class="button-link" href="${escapeAttr(withBase(site.base, '/'))}">返回首页</a>
</section>`;

  return layout({
    site,
    title: '页面不存在',
    description: '页面不存在，返回首页继续浏览。',
    path: '/404.html',
    content,
    canonical: false,
    noindex: true,
    css,
  });
}
