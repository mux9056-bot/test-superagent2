import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentValidationError, loadContent } from '../lib/content.mjs';

const ABOUT = '---\ntitle: 关于我\n---\n\n这里是个人介绍。\n';

function postFile({
  title = '一篇文章',
  slug = 'a-post',
  date = '2026-01-01',
  description = '这是一段用于测试的摘要，长度需要达到建议范围，方便校验逻辑稳定运行。',
  tags = null,
  draft = null,
  updated = null,
  extra = null,
  body = '正文内容。',
  omit = [],
} = {}) {
  const fields = [
    ['title', title],
    ['slug', slug],
    ['date', date],
    ['description', description],
  ]
    .filter(([key]) => !omit.includes(key))
    .map(([key, value]) => `${key}: ${value}`);
  if (tags) fields.push('tags:', ...tags.map((tag) => `  - ${tag}`));
  if (draft !== null) fields.push(`draft: ${draft}`);
  if (updated) fields.push(`updated: ${updated}`);
  if (extra) fields.push(extra);
  return `---\n${fields.join('\n')}\n---\n\n${body}`;
}

function makeContent(posts, { about = ABOUT } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-content-'));
  fs.mkdirSync(path.join(dir, 'posts'), { recursive: true });
  for (const [name, content] of Object.entries(posts)) {
    fs.writeFileSync(path.join(dir, 'posts', name), content);
  }
  if (about !== null) fs.writeFileSync(path.join(dir, 'about.md'), about);
  return dir;
}

function loadFrom(dir, today = '2026-06-01') {
  try {
    return { ok: true, ...loadContent({ contentDir: dir, today }) };
  } catch (error) {
    if (error instanceof ContentValidationError) return { ok: false, error };
    throw error;
  }
}

function errorsOf(result) {
  assert.equal(result.ok, false, '期望校验失败');
  return result.error.errors.join('\n');
}

test('合法文章与关于页通过校验，并规范化标签', () => {
  const dir = makeContent({
    'a-post.md': postFile({
      tags: [' 日常 ', '日常', '阅读'],
      draft: 'false',
      updated: '2026-02-01',
    }),
  });
  try {
    const result = loadFrom(dir);
    assert.equal(result.ok, true, result.ok ? '' : result.error.message);
    assert.equal(result.posts.length, 1);
    const [post] = result.posts;
    assert.equal(post.slug, 'a-post');
    assert.deepEqual(post.tags, ['日常', '阅读']);
    assert.equal(post.draft, false);
    assert.equal(post.updated, '2026-02-01');
    assert.equal(result.about.title, '关于我');
    assert.deepEqual(result.about.socials, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('缺少必填字段时指出字段名', () => {
  const dir = makeContent({ 'a-post.md': postFile({ omit: ['title'] }) });
  try {
    assert.match(errorsOf(loadFrom(dir)), /缺少必填字段 title/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('非法 slug 被拒绝', () => {
  const dir = makeContent({ 'a-post.md': postFile({ slug: 'Bad_Slug' }) });
  try {
    assert.match(errorsOf(loadFrom(dir)), /slug 只能包含小写英文字母、数字和连字符/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('非法日期与带时间的日期被拒绝', () => {
  const badDate = makeContent({ 'a-post.md': postFile({ date: '2026-02-30' }) });
  try {
    assert.match(errorsOf(loadFrom(badDate)), /date 必须是 YYYY-MM-DD/);
  } finally {
    fs.rmSync(badDate, { recursive: true, force: true });
  }

  const withTime = makeContent({ 'a-post.md': postFile({ date: '2026-02-03T10:00:00Z' }) });
  try {
    assert.match(errorsOf(loadFrom(withTime)), /date 必须是 YYYY-MM-DD/);
  } finally {
    fs.rmSync(withTime, { recursive: true, force: true });
  }
});

test('updated 不能早于 date', () => {
  const dir = makeContent({ 'a-post.md': postFile({ date: '2026-03-01', updated: '2026-02-01' }) });
  try {
    assert.match(errorsOf(loadFrom(dir)), /updated 不能早于 date/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('slug 重复时指出冲突文件', () => {
  const dir = makeContent({
    'one.md': postFile({ slug: 'same-slug' }),
    'two.md': postFile({ slug: 'same-slug' }),
  });
  try {
    const message = errorsOf(loadFrom(dir));
    assert.match(message, /slug「same-slug」在全站重复/);
    assert.match(message, /posts\/one\.md/);
    assert.match(message, /posts\/two\.md/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('未知字段、错误类型与标签非法字符被拒绝', () => {
  const unknown = makeContent({ 'a-post.md': postFile({ extra: 'author: 某人' }) });
  try {
    assert.match(errorsOf(loadFrom(unknown)), /未知字段「author」/);
  } finally {
    fs.rmSync(unknown, { recursive: true, force: true });
  }

  const badTypes = makeContent({
    'a-post.md': postFile({ draft: '"true"', extra: 'tags: 日常' }),
  });
  try {
    const message = errorsOf(loadFrom(badTypes));
    assert.match(message, /tags 必须是字符串数组/);
    assert.match(message, /draft 必须是布尔值/);
  } finally {
    fs.rmSync(badTypes, { recursive: true, force: true });
  }

  const badTag = makeContent({ 'a-post.md': postFile({ tags: ['日常/生活'] }) });
  try {
    assert.match(errorsOf(loadFrom(badTag)), /标签「日常\/生活」包含不能在链接中使用的字符/);
  } finally {
    fs.rmSync(badTag, { recursive: true, force: true });
  }
});

test('draft 必须是布尔值', () => {
  const dir = makeContent({ 'a-post.md': postFile({ draft: 'yes' }) });
  try {
    assert.match(errorsOf(loadFrom(dir)), /draft 必须是布尔值/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('未来日期的非草稿文章被拒绝，草稿允许', () => {
  const future = makeContent({ 'a-post.md': postFile({ date: '2026-12-01' }) });
  try {
    assert.match(errorsOf(loadFrom(future, '2026-06-01')), /未来日期的文章只能标记为草稿/);
  } finally {
    fs.rmSync(future, { recursive: true, force: true });
  }

  const draft = makeContent({ 'a-post.md': postFile({ date: '2026-12-01', draft: 'true' }) });
  try {
    assert.equal(loadFrom(draft, '2026-06-01').ok, true);
  } finally {
    fs.rmSync(draft, { recursive: true, force: true });
  }
});

test('正文为空被拒绝', () => {
  const dir = makeContent({ 'a-post.md': postFile({ body: '   ' }) });
  try {
    assert.match(errorsOf(loadFrom(dir)), /正文不能为空/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('摘要过短只产生警告，不阻断构建', () => {
  const dir = makeContent({ 'a-post.md': postFile({ description: '太短了' }) });
  try {
    const result = loadFrom(dir);
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((warning) => warning.includes('description 建议 50～120')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('关于页校验 avatar 与 socials，并只保留填写了链接的平台', () => {
  const badAvatar = makeContent(
    { 'a-post.md': postFile() },
    { about: '---\ntitle: 关于我\navatar: images/avatar.png\n---\n\n介绍。\n' },
  );
  try {
    assert.match(errorsOf(loadFrom(badAvatar)), /avatar 需以 \/ 开头/);
  } finally {
    fs.rmSync(badAvatar, { recursive: true, force: true });
  }

  const badSocials = makeContent(
    { 'a-post.md': postFile() },
    {
      about:
        '---\ntitle: 关于我\nsocials:\n  - label: GitHub\n    url: github.com/me\n---\n\n介绍。\n',
    },
  );
  try {
    assert.match(errorsOf(loadFrom(badSocials)), /url 必须以 http/);
  } finally {
    fs.rmSync(badSocials, { recursive: true, force: true });
  }

  const good = makeContent(
    { 'a-post.md': postFile() },
    {
      about:
        '---\ntitle: 关于我\navatar: /images/avatar.png\nsocials:\n  - label: GitHub\n    url: https://github.com/me\n---\n\n介绍。\n',
    },
  );
  try {
    const result = loadFrom(good);
    assert.equal(result.ok, true, result.ok ? '' : result.error.message);
    assert.equal(result.about.avatar, '/images/avatar.png');
    assert.deepEqual(result.about.socials, [{ label: 'GitHub', url: 'https://github.com/me' }]);
  } finally {
    fs.rmSync(good, { recursive: true, force: true });
  }
});

test('缺少 about.md 与缺少 posts 目录都会报错', () => {
  const noAbout = makeContent({ 'a-post.md': postFile() }, { about: null });
  try {
    assert.match(errorsOf(loadFrom(noAbout)), /about\.md：文件不存在/);
  } finally {
    fs.rmSync(noAbout, { recursive: true, force: true });
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-content-'));
  fs.writeFileSync(path.join(dir, 'about.md'), ABOUT);
  try {
    assert.match(errorsOf(loadFrom(dir)), /posts\/：目录不存在/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('一次报告多篇文章的全部错误', () => {
  const dir = makeContent({
    'one.md': postFile({ omit: ['title'] }),
    'two.md': postFile({ date: 'bad-date' }),
  });
  try {
    const result = loadFrom(dir);
    assert.equal(result.ok, false);
    assert.equal(result.error.errors.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
