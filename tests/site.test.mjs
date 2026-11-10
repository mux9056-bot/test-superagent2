import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { site as projectSite } from '../site.config.mjs';
import { ContentValidationError } from '../lib/content.mjs';
import { buildSite } from '../lib/site.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

const baseSite = {
  ...projectSite,
  url: 'https://blog.example.com',
  base: '',
  socials: [],
};

function buildProject(options = {}) {
  const outDir = fs.mkdtempSync(path.join(projectRoot, '.test-build-'));
  const result = buildSite({
    site: baseSite,
    rootDir: projectRoot,
    outDir,
    ...options,
  });
  return {
    result,
    outDir,
    read: (relativePath) => fs.readFileSync(path.join(outDir, relativePath), 'utf8'),
    exists: (relativePath) => fs.existsSync(path.join(outDir, relativePath)),
    cleanup: () => fs.rmSync(outDir, { recursive: true, force: true }),
  };
}

const ABOUT = '---\ntitle: 关于我\n---\n\n这里是个人介绍。\n';

function makeFixture({ posts = {}, about = ABOUT, publicFiles = {} }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-site-'));
  fs.mkdirSync(path.join(root, 'content', 'posts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  for (const [name, content] of Object.entries(posts)) {
    fs.writeFileSync(path.join(root, 'content', 'posts', name), content);
  }
  if (about !== null) fs.writeFileSync(path.join(root, 'content', 'about.md'), about);
  for (const [name, content] of Object.entries(publicFiles)) {
    const filePath = path.join(root, 'public', name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }
  return root;
}

function postFile({ title = '一篇文章', slug = 'a-post', body = '正文内容。', draft = false, date = '2026-01-01', tags = null } = {}) {
  const lines = [
    '---',
    `title: ${title}`,
    `slug: ${slug}`,
    `date: ${date}`,
    'description: 这是一段用于测试的摘要，长度达到建议范围，确保校验逻辑可以稳定运行。',
  ];
  if (tags) lines.push('tags:', ...tags.map((tag) => `  - ${tag}`));
  lines.push(`draft: ${draft}`, '---', '', body);
  return lines.join('\n');
}

function buildFixture(root, options = {}) {
  return buildSite({
    site: baseSite,
    rootDir: root,
    outDir: path.join(root, 'dist'),
    ...options,
  });
}

test('正式构建排除草稿并生成分页、标签与文章页', () => {
  const build = buildProject();
  try {
    assert.equal(build.result.stats.published, 12);
    assert.equal(build.result.stats.drafts, 1);
    assert.equal(build.result.stats.includedDrafts, 0);
    assert.equal(build.result.stats.homePages, 2);
    assert.ok(build.exists('index.html'));
    assert.ok(build.exists('page/2/index.html'));
    assert.ok(build.exists('archives/index.html'));
    assert.ok(build.exists('tags/index.html'));
    assert.ok(build.exists('tags/阅读/index.html'));
    assert.ok(build.exists('about/index.html'));
    assert.ok(build.exists('rss.xml'));
    assert.ok(build.exists('sitemap.xml'));
    assert.ok(build.exists('robots.txt'));
    assert.ok(build.exists('404.html'));
    assert.equal(build.exists('posts/unfinished-summer/index.html'), false);

    const home = build.read('index.html');
    assert.match(home, /<link rel="canonical" href="https:\/\/blog\.example\.com\/">/);
    assert.match(home, /第 1 \/ 2 页/);
    assert.doesNotMatch(home, /未完成的夏天/);

    const rss = build.read('rss.xml');
    assert.doesNotMatch(rss, /unfinished-summer/);
    assert.match(rss, /<link>https:\/\/blog\.example\.com\/posts\/autumn-evening-walk\/<\/link>/);

    const sitemap = build.read('sitemap.xml');
    assert.doesNotMatch(sitemap, /unfinished-summer/);
    assert.match(sitemap, /https:\/\/blog\.example\.com\/tags\/%E9%98%85%E8%AF%BB\//);
  } finally {
    build.cleanup();
  }
});

test('预览构建包含草稿并在页面上标记', () => {
  const build = buildProject({ includeDrafts: true });
  try {
    assert.equal(build.result.stats.includedDrafts, 1);
    assert.ok(build.exists('posts/unfinished-summer/index.html'));
    const draftPage = build.read('posts/unfinished-summer/index.html');
    assert.match(draftPage, /草稿/);
    assert.match(build.read('index.html'), /未完成的夏天/);
  } finally {
    build.cleanup();
  }
});

test('首页站名后展示电话，其他页面不展示', () => {
  const build = buildProject();
  try {
    const home = build.read('index.html');
    assert.match(home, />我的博客<\/a><span class="site-phone">18888888888<\/span>/);
    assert.match(build.read('page/2/index.html'), /18888888888/);
    for (const page of [
      'posts/why-i-write-again/index.html',
      'archives/index.html',
      'tags/index.html',
      'about/index.html',
      '404.html',
    ]) {
      assert.doesNotMatch(build.read(page), /18888888888/, page);
    }
  } finally {
    build.cleanup();
  }
});

test('配置 base 时所有地址都带子路径', () => {
  const root = fs.mkdtempSync(path.join(projectRoot, '.test-build-'));
  try {
    buildSite({
      site: { ...baseSite, base: '/blog' },
      rootDir: projectRoot,
      outDir: root,
    });
    const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
    const home = read('index.html');
    assert.match(home, /href="\/blog\/posts\/autumn-evening-walk\/"/);
    assert.match(home, /<link rel="canonical" href="https:\/\/blog\.example\.com\/blog\/">/);
    assert.match(read('rss.xml'), /https:\/\/blog\.example\.com\/blog\/posts\//);
    assert.match(read('robots.txt'), /Sitemap: https:\/\/blog\.example\.com\/blog\/sitemap\.xml/);
    assert.ok(fs.existsSync(path.join(root, 'tags/阅读/index.html')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('write=false 只校验不写文件', () => {
  const outDir = path.join(fs.mkdtempSync(path.join(projectRoot, '.test-build-')), 'dist');
  try {
    const result = buildSite({ site: baseSite, rootDir: projectRoot, outDir, write: false });
    assert.ok(result.pages.length > 0);
    assert.equal(fs.existsSync(outDir), false);
  } finally {
    fs.rmSync(path.dirname(outDir), { recursive: true, force: true });
  }
});

test('rssLimit 限制订阅条目数量', () => {
  const build = buildProject({ site: { ...baseSite, rssLimit: 5 } });
  try {
    const rss = build.read('rss.xml');
    assert.equal((rss.match(/<item>/g) ?? []).length, 5);
  } finally {
    build.cleanup();
  }
});

test('指向不存在文章的站内链接让构建失败', () => {
  const root = makeFixture({
    posts: { 'a-post.md': postFile({ body: '看[这篇](/posts/missing-post/)。' }) },
  });
  try {
    assert.throws(
      () => buildFixture(root),
      (error) => {
        assert.ok(error instanceof ContentValidationError);
        assert.match(error.errors.join('\n'), /站内链接指向不存在的页面/);
        return true;
      },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('相对链接让构建失败', () => {
  const root = makeFixture({
    posts: { 'a-post.md': postFile({ body: '看[这篇](./another/)。' }) },
  });
  try {
    assert.throws(
      () => buildFixture(root),
      (error) => /站内链接需以 \/ 开头/.test(error.errors.join('\n')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('不存在的本地图片与缺少替代文本都会让构建失败', () => {
  const missingImage = makeFixture({
    posts: { 'a-post.md': postFile({ body: '![图](/images/missing.png)' }) },
  });
  try {
    assert.throws(
      () => buildFixture(missingImage),
      (error) => /图片不存在/.test(error.errors.join('\n')),
    );
  } finally {
    fs.rmSync(missingImage, { recursive: true, force: true });
  }

  const missingAlt = makeFixture({
    posts: { 'a-post.md': postFile({ body: '![](/images/photo.png)' }) },
    publicFiles: { 'images/photo.png': 'fake-image-content' },
  });
  try {
    assert.throws(
      () => buildFixture(missingAlt),
      (error) => /缺少替代文本 alt/.test(error.errors.join('\n')),
    );
  } finally {
    fs.rmSync(missingAlt, { recursive: true, force: true });
  }
});

test('正式构建禁止链接到草稿，预览构建允许', () => {
  const root = makeFixture({
    posts: {
      'a-post.md': postFile({ body: '草稿是[这篇](/posts/draft-post/)。' }),
      'draft-post.md': postFile({ slug: 'draft-post', title: '草稿文章', draft: true, body: '草稿正文。' }),
    },
  });
  try {
    assert.throws(
      () => buildFixture(root),
      (error) => /链接指向草稿文章/.test(error.errors.join('\n')),
    );
    const result = buildFixture(root, { includeDrafts: true });
    assert.equal(result.stats.includedDrafts, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('文章 URL 由 slug 决定，与标题和文件名无关', () => {
  const root = makeFixture({
    posts: { 'not-matching-the-slug.md': postFile({ title: '最初的标题', slug: 'fixed-slug' }) },
  });
  try {
    const first = buildFixture(root);
    assert.ok(first.pages.some((page) => page.route === '/posts/fixed-slug/'));
    assert.ok(fs.existsSync(path.join(root, 'dist/posts/fixed-slug/index.html')));

    fs.writeFileSync(
      path.join(root, 'content/posts/not-matching-the-slug.md'),
      postFile({ title: '修改过的标题', slug: 'fixed-slug' }),
    );
    const second = buildFixture(root);
    assert.ok(second.routes.includes('/posts/fixed-slug/'));
    assert.match(
      fs.readFileSync(path.join(root, 'dist/posts/fixed-slug/index.html'), 'utf8'),
      /修改过的标题/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('关于页头像不存在时构建失败', () => {
  const root = makeFixture({
    posts: { 'a-post.md': postFile() },
    about: '---\ntitle: 关于我\navatar: /images/nobody.png\n---\n\n介绍。\n',
  });
  try {
    assert.throws(
      () => buildFixture(root),
      (error) => /avatar 指向的图片不存在/.test(error.errors.join('\n')),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
