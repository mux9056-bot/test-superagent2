import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  absoluteUrl,
  collectTags,
  compareNewestFirst,
  encodedTagPath,
  formatDate,
  formatMonthDay,
  isValidDateString,
  localToday,
  neighboursOf,
  normalizeRoutePath,
  paginate,
  readImageDimensions,
  sortNewestFirst,
  withBase,
} from '../lib/utils.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');

test('日期校验只接受合法的 YYYY-MM-DD', () => {
  assert.equal(isValidDateString('2026-11-04'), true);
  assert.equal(isValidDateString('2024-02-29'), true);
  assert.equal(isValidDateString('2025-02-29'), false);
  assert.equal(isValidDateString('2026-13-01'), false);
  assert.equal(isValidDateString('2026-1-1'), false);
  assert.equal(isValidDateString('2026-11-04T10:00:00Z'), false);
  assert.equal(isValidDateString(20261104), false);
});

test('日期展示为纯日期，不随时区跨日', () => {
  assert.equal(formatDate('2026-11-04'), '2026 年 11 月 4 日');
  assert.equal(formatMonthDay('2026-11-04'), '11 月 4 日');
  assert.equal(localToday(new Date(2026, 10, 4, 23, 30)), '2026-11-04');
});

test('文章排序：新的在前，同日按 slug 升序', () => {
  const posts = [
    { slug: 'b-post', date: '2026-11-04' },
    { slug: 'a-post', date: '2026-11-04' },
    { slug: 'newer', date: '2026-12-01' },
    { slug: 'older', date: '2025-01-01' },
  ];
  assert.deepEqual(
    sortNewestFirst(posts).map((post) => post.slug),
    ['newer', 'a-post', 'b-post', 'older'],
  );
  assert.equal(compareNewestFirst(
    { slug: 'a-post', date: '2026-11-04' },
    { slug: 'b-post', date: '2026-11-04' },
  ), -1);
});

test('分页：每页 10 篇，边界不多不少', () => {
  const items = Array.from({ length: 12 }, (_, index) => index);
  const pages = paginate(items, 10);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0], items.slice(0, 10));
  assert.deepEqual(pages[1], items.slice(10));
  assert.deepEqual(paginate([], 10), [[]]);
  assert.deepEqual(paginate(items, 12), [items]);
});

test('标签按名称排序并统计文章数；无标签文章不影响', () => {
  const posts = [
    { tags: ['随笔', '写作'] },
    { tags: ['阅读'] },
    { tags: [] },
    { tags: ['日常', '写作'] },
  ];
  assert.deepEqual(collectTags(posts), [
    { name: '日常', count: 1 },
    { name: '随笔', count: 1 },
    { name: '写作', count: 2 },
    { name: '阅读', count: 1 },
  ]);
});

test('上一篇是较早文章，下一篇是较新文章', () => {
  const chronological = [
    { slug: 'oldest' },
    { slug: 'middle' },
    { slug: 'newest' },
  ];
  assert.deepEqual(neighboursOf(chronological, 0), { previous: null, next: chronological[1] });
  assert.deepEqual(neighboursOf(chronological, 1), {
    previous: chronological[0],
    next: chronological[2],
  });
  assert.deepEqual(neighboursOf(chronological, 2), { previous: chronological[1], next: null });
});

test('站内路径与绝对地址拼接一致', () => {
  assert.equal(normalizeRoutePath('posts/a-post'), '/posts/a-post/');
  assert.equal(normalizeRoutePath('/rss.xml'), '/rss.xml');
  assert.equal(normalizeRoutePath('/tags/日常/'), '/tags/日常/');
  assert.equal(withBase('', '/about/'), '/about/');
  assert.equal(withBase('/blog', '/about/'), '/blog/about/');
  assert.equal(absoluteUrl({ url: 'https://example.com', base: '/blog' }, '/about/'), 'https://example.com/blog/about/');
  assert.equal(encodedTagPath('日常'), '/tags/%E6%97%A5%E5%B8%B8/');
});

test('读取本地图片宽高（PNG / JPEG / SVG）', () => {
  assert.deepEqual(
    readImageDimensions(path.join(projectRoot, 'public/images/avatar/avatar.png')),
    { width: 240, height: 240 },
  );
  assert.deepEqual(
    readImageDimensions(path.join(projectRoot, 'public/images/desk/desk.jpg')),
    { width: 1200, height: 800 },
  );
  assert.deepEqual(
    readImageDimensions(path.join(projectRoot, 'public/og-default.png')),
    { width: 1200, height: 630 },
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-image-'));
  const svg = path.join(dir, 'icon.svg');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 48"></svg>');
  assert.deepEqual(readImageDimensions(svg), { width: 64, height: 48 });

  const text = path.join(dir, 'note.txt');
  fs.writeFileSync(text, 'not an image');
  assert.equal(readImageDimensions(text), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('主要文字与背景的对比度达到 WCAG AA', () => {
  const css = fs.readFileSync(path.join(projectRoot, 'styles/global.css'), 'utf8');
  const variables = Object.fromEntries(
    [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [match[1], match[2]]),
  );

  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5]
      .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (foreground, background) => {
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (lighter + 0.05) / (darker + 0.05);
  };

  const pairs = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['text-muted', 'bg'],
    ['text-muted', 'surface'],
    ['text-faint', 'bg'],
    ['text-faint', 'surface'],
    ['accent', 'bg'],
    ['accent', 'surface'],
    ['accent', 'accent-soft'],
  ];
  for (const [foreground, background] of pairs) {
    const value = ratio(variables[foreground], variables[background]);
    assert.ok(
      value >= 4.5,
      `${foreground} 与 ${background} 的对比度 ${value.toFixed(2)} 低于 4.5`,
    );
  }
});
