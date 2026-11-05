import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { isValidDateString, localToday, relativeDisplayPath } from './utils.mjs';

const POST_FIELDS = new Set(['title', 'slug', 'date', 'description', 'updated', 'tags', 'draft']);
const ABOUT_FIELDS = new Set(['title', 'avatar', 'socials']);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TAG_FORBIDDEN = /[\\/?#%\u0000-\u001f\u007f]/;

// 使用 JSON Schema 读取 Front Matter：日期保持字符串，避免 YAML 把日期
// 自动转成 Date 后，把 2026-02-30 这类非法日期悄悄改成另一个日期。
const FRONT_MATTER_OPTIONS = {
  engines: {
    yaml: {
      parse: (source) => yaml.load(source, { schema: yaml.JSON_SCHEMA }),
      stringify: (data) => yaml.dump(data),
    },
  },
};

export class ContentValidationError extends Error {
  constructor(errors, warnings = []) {
    super(`内容校验失败：\n${errors.map((item) => `- ${item}`).join('\n')}`);
    this.name = 'ContentValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }
}

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '数组';
  if (typeof value === 'string') return '字符串';
  if (typeof value === 'number') return '数字';
  if (typeof value === 'boolean') return '布尔值';
  if (typeof value === 'object') return '对象';
  return typeof value;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * YAML 会把未加引号的 2026-11-04 解析成 Date（UTC 零点）。
 * 这里统一还原成日期字符串；带时间的写法视为错误，避免时区造成跨日。
 */
function normalizeYamlDate(value) {
  if (!(value instanceof Date)) return { value };
  if (Number.isNaN(value.getTime())) return { value };
  const iso = value.toISOString();
  if (iso.slice(11) !== '00:00:00.000Z') {
    return { value, hasTime: true, iso };
  }
  return { value: iso.slice(0, 10) };
}

function validateTags(rawTags, report) {
  if (rawTags === undefined) return [];
  if (!Array.isArray(rawTags)) {
    report(`字段 tags 必须是字符串数组（当前是 ${typeName(rawTags)}）`);
    return [];
  }
  const tags = [];
  const seen = new Set();
  for (const rawTag of rawTags) {
    if (typeof rawTag !== 'string') {
      report(`字段 tags 的每一项都必须是字符串（当前包含 ${typeName(rawTag)}）`);
      continue;
    }
    const tag = rawTag.trim();
    if (!tag) {
      report('字段 tags 不能包含空字符串；不需要标签时请删除该字段或整个数组');
      continue;
    }
    if (tag.length > 30) {
      report(`字段 tags 中的标签「${tag}」过长（最多 30 个字符）`);
      continue;
    }
    if (TAG_FORBIDDEN.test(tag)) {
      report(`字段 tags 中的标签「${tag}」包含不能在链接中使用的字符（\\ / ? # % 及控制字符）`);
      continue;
    }
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function validatePost(data, body, { file, today }) {
  const errors = [];
  const warnings = [];
  const report = (message) => errors.push(`${file}：${message}`);

  if (!isPlainObject(data)) {
    report('YAML 元数据必须是键值对');
    return { ok: false, errors, warnings };
  }

  for (const key of Object.keys(data)) {
    if (!POST_FIELDS.has(key)) {
      report(`未知字段「${key}」；文章可用字段：${[...POST_FIELDS].join('、')}`);
    }
  }

  const title = data.title;
  if (title === undefined || title === null) {
    report('缺少必填字段 title');
  } else if (typeof title !== 'string') {
    report(`字段 title 必须是字符串（当前是 ${typeName(title)}）`);
  } else if (!title.trim()) {
    report('字段 title 不能为空');
  }

  const slug = data.slug;
  if (slug === undefined || slug === null) {
    report('缺少必填字段 slug');
  } else if (typeof slug !== 'string') {
    report(`字段 slug 必须是字符串（当前是 ${typeName(slug)}）`);
  } else if (!SLUG_PATTERN.test(slug.trim())) {
    report(
      `字段 slug 只能包含小写英文字母、数字和连字符，且不能以连字符开头或结尾（当前「${slug}」）`,
    );
  } else if (slug.trim().length > 80) {
    report('字段 slug 不能超过 80 个字符');
  }

  const dateInfo = normalizeYamlDate(data.date);
  const date = dateInfo.value;
  if (date === undefined || date === null) {
    report('缺少必填字段 date');
  } else if (dateInfo.hasTime) {
    report(`字段 date 只写日期（YYYY-MM-DD），不要包含时间（解析为 ${dateInfo.iso}）`);
  } else if (!isValidDateString(date)) {
    report(`字段 date 必须是 YYYY-MM-DD 格式的有效日期（当前「${date}」）`);
  }

  const description = data.description;
  if (description === undefined || description === null) {
    report('缺少必填字段 description');
  } else if (typeof description !== 'string') {
    report(`字段 description 必须是字符串（当前是 ${typeName(description)}）`);
  } else if (!description.trim()) {
    report('字段 description 不能为空');
  } else {
    const length = [...description.trim()].length;
    if (length < 50 || length > 120) {
      warnings.push(`${file}：字段 description 建议 50～120 个字符（当前 ${length} 个）`);
    }
  }

  let updated = null;
  if (data.updated !== undefined && data.updated !== null) {
    const updatedInfo = normalizeYamlDate(data.updated);
    if (updatedInfo.hasTime) {
      report(`字段 updated 只写日期（YYYY-MM-DD），不要包含时间（解析为 ${updatedInfo.iso}）`);
    } else if (!isValidDateString(updatedInfo.value)) {
      report(`字段 updated 必须是 YYYY-MM-DD 格式的有效日期（当前「${updatedInfo.value}」）`);
    } else if (isValidDateString(date) && updatedInfo.value < date) {
      report(`字段 updated 不能早于 date（updated: ${updatedInfo.value}，date: ${date}）`);
    } else {
      updated = updatedInfo.value;
    }
  }

  const tags = validateTags(data.tags, report);

  let draft = false;
  if (data.draft !== undefined && data.draft !== null) {
    if (typeof data.draft !== 'boolean') {
      report(`字段 draft 必须是布尔值 true 或 false（当前是 ${typeName(data.draft)}）`);
    } else {
      draft = data.draft;
    }
  }

  if (isValidDateString(date) && date > today && !draft) {
    report(
      `发布日期 ${date} 晚于今天 ${today}；未来日期的文章只能标记为草稿（draft: true）`,
    );
  }

  if (!body || !body.trim()) {
    report('正文不能为空');
  }

  const ok = errors.length === 0;
  return {
    ok,
    errors,
    warnings,
    post: ok
      ? {
          title: title.trim(),
          slug: slug.trim(),
          date,
          updated,
          description: description.trim(),
          tags,
          draft,
          content: body,
        }
      : null,
  };
}

function validateAbout(data, body, { file }) {
  const errors = [];
  const report = (message) => errors.push(`${file}：${message}`);

  if (!isPlainObject(data)) {
    report('YAML 元数据必须是键值对');
    return { ok: false, errors };
  }

  for (const key of Object.keys(data)) {
    if (!ABOUT_FIELDS.has(key)) {
      report(`未知字段「${key}」；关于页可用字段：${[...ABOUT_FIELDS].join('、')}`);
    }
  }

  let title = '关于我';
  if (data.title !== undefined && data.title !== null) {
    if (typeof data.title !== 'string' || !data.title.trim()) {
      report('字段 title 必须是非空字符串');
    } else {
      title = data.title.trim();
    }
  }

  let avatar = null;
  if (data.avatar !== undefined && data.avatar !== null) {
    if (typeof data.avatar !== 'string' || !data.avatar.trim()) {
      report('字段 avatar 必须是图片路径字符串，例如 /images/avatar.png');
    } else if (!data.avatar.startsWith('/')) {
      report('字段 avatar 需以 / 开头，指向 public 目录中的图片');
    } else {
      avatar = data.avatar.trim();
    }
  }

  let socials = [];
  if (data.socials !== undefined && data.socials !== null) {
    if (!Array.isArray(data.socials)) {
      report('字段 socials 必须是数组，例如 [{ label: "GitHub", url: "https://..." }]');
    } else {
      for (const [index, item] of data.socials.entries()) {
        if (!isPlainObject(item)) {
          report(`字段 socials 第 ${index + 1} 项必须是包含 label 和 url 的对象`);
          continue;
        }
        if (typeof item.label !== 'string' || !item.label.trim()) {
          report(`字段 socials 第 ${index + 1} 项缺少非空的 label`);
          continue;
        }
        if (typeof item.url !== 'string' || !/^(https?:\/\/|mailto:)/i.test(item.url.trim())) {
          report(`字段 socials 第 ${index + 1} 项的 url 必须以 http://、https:// 或 mailto: 开头`);
          continue;
        }
        socials.push({ label: item.label.trim(), url: item.url.trim() });
      }
    }
  }

  if (!body || !body.trim()) {
    report('正文不能为空');
  }

  const ok = errors.length === 0;
  return { ok, errors, about: ok ? { title, avatar, socials, content: body } : null };
}

/**
 * 读取并校验 content/posts/*.md 与 content/about.md。
 * 校验失败时抛出 ContentValidationError，包含所有错误，便于一次修完。
 */
export function loadContent({ contentDir, today = localToday() }) {
  const errors = [];
  const warnings = [];
  const contentRoot = path.resolve(contentDir);
  const displayRoot = path.basename(contentRoot) || 'content';
  const display = (filePath) => `${displayRoot}/${relativeDisplayPath(contentRoot, filePath)}`;
  const postsDir = path.join(contentRoot, 'posts');
  const posts = [];

  if (!fs.existsSync(postsDir)) {
    errors.push(`${displayRoot}/posts/：目录不存在，文章应放在 ${displayRoot}/posts/ 下`);
  } else {
    const files = fs
      .readdirSync(postsDir)
      .filter((name) => name.endsWith('.md'))
      .sort();

    for (const name of files) {
      const filePath = path.join(postsDir, name);
      const file = display(filePath);
      let parsed;
      try {
        parsed = matter(fs.readFileSync(filePath, 'utf8'), FRONT_MATTER_OPTIONS);
      } catch (error) {
        errors.push(`${file}：YAML 元数据解析失败（${error.message}）`);
        continue;
      }
      const result = validatePost(parsed.data, parsed.content, { file, today });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
      if (result.ok) {
        posts.push({ ...result.post, file, sourcePath: filePath });
      }
    }
  }

  const bySlug = new Map();
  for (const post of posts) {
    const list = bySlug.get(post.slug) ?? [];
    list.push(post);
    bySlug.set(post.slug, list);
  }
  for (const [slug, list] of bySlug) {
    if (list.length > 1) {
      errors.push(`slug「${slug}」在全站重复：${list.map((post) => post.file).join('、')}`);
    }
  }

  const aboutPath = path.join(contentRoot, 'about.md');
  let about = null;
  if (!fs.existsSync(aboutPath)) {
    errors.push(`${displayRoot}/about.md：文件不存在，关于页内容从这里读取`);
  } else {
    let parsed;
    try {
      parsed = matter(fs.readFileSync(aboutPath, 'utf8'), FRONT_MATTER_OPTIONS);
    } catch (error) {
      errors.push(`${displayRoot}/about.md：YAML 元数据解析失败（${error.message}）`);
    }
    if (parsed) {
      const result = validateAbout(parsed.data, parsed.content, { file: display(aboutPath) });
      errors.push(...result.errors);
      if (result.ok) about = { ...result.about, file: display(aboutPath), sourcePath: aboutPath };
    }
  }

  if (errors.length) throw new ContentValidationError(errors, warnings);
  return { posts, about, warnings };
}

export function selectPosts(posts, { includeDrafts = false } = {}) {
  const selected = includeDrafts ? posts : posts.filter((post) => !post.draft);
  return selected;
}
