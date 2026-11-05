import fs from 'node:fs';
import path from 'node:path';

const COLLATOR = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true });
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const escapeAttr = escapeHtml;
export const escapeXml = escapeHtml;

export function isValidDateString(value) {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export function formatMonthDay(value) {
  const [, month, day] = value.split('-').map(Number);
  return `${month} 月 ${day} 日`;
}

export function yearOf(value) {
  return value.slice(0, 4);
}

export function localToday(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** 新的在前；同一天按 slug 升序，保证列表、归档、上一篇/下一篇顺序一致。 */
export function compareNewestFirst(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  if (a.slug === b.slug) return 0;
  return a.slug < b.slug ? -1 : 1;
}

export function compareOldestFirst(a, b) {
  return -compareNewestFirst(a, b);
}

export function sortNewestFirst(posts) {
  return [...posts].sort(compareNewestFirst);
}

export function paginate(items, perPage) {
  const pages = [];
  for (let index = 0; index < items.length; index += perPage) {
    pages.push(items.slice(index, index + perPage));
  }
  if (pages.length === 0) pages.push([]);
  return pages;
}

export function collectTags(posts) {
  const counts = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => COLLATOR.compare(a.name, b.name) || a.name.localeCompare(b.name));
}

/**
 * 相邻文章：传入按时间从旧到新排序的列表。
 * 上一篇是较早的文章，下一篇是较新的文章。
 */
export function neighboursOf(chronological, index) {
  return {
    previous: index > 0 ? chronological[index - 1] : null,
    next: index < chronological.length - 1 ? chronological[index + 1] : null,
  };
}

export function withBase(base, pathname) {
  if (!base) return pathname;
  return `${base}${pathname}`;
}

export function absoluteUrl(site, pathname) {
  return `${site.url}${withBase(site.base, pathname)}`;
}

export function isExternalHref(href) {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) || href.startsWith('//');
}

/** 站内页面路径统一为以 / 开头、以 / 结尾的形式。 */
export function normalizeRoutePath(pathname) {
  let value = pathname.trim();
  if (!value.startsWith('/')) value = `/${value}`;
  const lastSegment = value.split('/').filter(Boolean).pop() ?? '';
  const looksLikeFile = /\.[a-zA-Z0-9]+$/.test(lastSegment);
  if (!looksLikeFile && !value.endsWith('/')) value += '/';
  return value;
}

export function encodedTagPath(tag) {
  return `/tags/${encodeURIComponent(tag)}/`;
}

const IMAGE_SIGNATURES = {
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

function dimensionsFromPng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(IMAGE_SIGNATURES.png)) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function dimensionsFromGif(buffer) {
  if (buffer.length < 10 || buffer.toString('ascii', 0, 3) !== 'GIF') return null;
  return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
}

function dimensionsFromJpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function dimensionsFromWebp(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  if (chunk === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }
  return null;
}

function dimensionsFromSvg(source) {
  const openTag = /<svg\b[^>]*>/i.exec(source);
  if (!openTag) return null;
  const tag = openTag[0];
  const width = /\bwidth=["']?\s*(\d+(?:\.\d+)?)/i.exec(tag);
  const height = /\bheight=["']?\s*(\d+(?:\.\d+)?)/i.exec(tag);
  if (width && height) {
    return { width: Math.round(Number(width[1])), height: Math.round(Number(height[1])) };
  }
  const viewBox = /\bviewBox=["']([^"']+)["']/i.exec(tag);
  if (viewBox) {
    const parts = viewBox[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
    }
  }
  return null;
}

/** 读取本地图片宽高，供 <img> 输出，避免加载时布局跳动。 */
export function readImageDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  return (
    dimensionsFromPng(buffer) ??
    dimensionsFromJpeg(buffer) ??
    dimensionsFromGif(buffer) ??
    dimensionsFromWebp(buffer) ??
    (path.extname(filePath).toLowerCase() === '.svg'
      ? dimensionsFromSvg(buffer.toString('utf8'))
      : null)
  );
}

export function relativeDisplayPath(baseDir, filePath) {
  return path.relative(baseDir, filePath).split(path.sep).join('/');
}
