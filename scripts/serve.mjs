import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { site } from '../site.config.mjs';
import { ContentValidationError } from '../lib/content.mjs';
import { buildSite } from '../lib/site.mjs';

const args = process.argv.slice(2);
const dev = args.includes('--dev');
const portIndex = args.indexOf('--port');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 4321);
const rootDir = process.cwd();
const outDir = path.join(rootDir, 'dist');
const base = site.base;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function build({ quiet = false } = {}) {
  const result = buildSite({
    site,
    rootDir,
    outDir,
    includeDrafts: dev,
  });
  if (!quiet) {
    for (const warning of result.warnings) console.warn(`警告：${warning}`);
    const draftNote = result.stats.includedDrafts
      ? `，包含 ${result.stats.includedDrafts} 篇草稿（已标记）`
      : '';
    console.log(
      `构建完成：${result.stats.published} 篇已发布文章${draftNote}，${result.stats.tags} 个标签。`,
    );
  }
  return result;
}

function collectFiles(dir, bucket = []) {
  if (!fs.existsSync(dir)) return bucket;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(filePath, bucket);
    else if (entry.isFile()) bucket.push(filePath);
  }
  return bucket;
}

function contentSignature() {
  const files = [
    ...collectFiles(path.join(rootDir, 'content')),
    ...collectFiles(path.join(rootDir, 'public')),
    ...collectFiles(path.join(rootDir, 'styles')),
    ...collectFiles(path.join(rootDir, 'lib')),
    path.join(rootDir, 'site.config.mjs'),
  ];
  return files
    .filter((file) => fs.existsSync(file))
    .sort()
    .map((file) => {
      const stat = fs.statSync(file);
      return `${file}:${stat.mtimeMs}:${stat.size}`;
    })
    .join('|');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sendErrorPage(res, error) {
  const message =
    error instanceof ContentValidationError
      ? error.message
      : error && error.stack
        ? error.stack
        : String(error);
  res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>构建失败</title>
<body style="font-family: system-ui, sans-serif; line-height: 1.7; padding: 2rem; max-width: 60rem; margin: 0 auto;">
<h1>构建失败</h1>
<p>修改内容后刷新页面会重新构建。</p>
<pre style="white-space: pre-wrap; background: #f4efe5; padding: 1rem; border-radius: 6px;">${escapeHtml(message)}</pre>
</body></html>`);
}

function sendNotFound(res) {
  const notFoundFile = path.join(outDir, '404.html');
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(fs.existsSync(notFoundFile) ? fs.readFileSync(notFoundFile) : '404 Not Found');
}

function resolvePathname(requestUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  } catch {
    return null;
  }
  if (base) {
    if (pathname === base || pathname === `${base}/`) return '/';
    if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
    else return null;
  }
  return pathname;
}

let lastSignature = null;
let lastBuild = null;

try {
  lastBuild = build({ quiet: !dev });
  lastSignature = contentSignature();
} catch (error) {
  if (!dev) {
    if (error instanceof ContentValidationError) {
      console.error('构建失败：内容校验未通过。');
      for (const item of error.errors) console.error(`- ${item}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
  console.error('首次构建失败，修复内容后刷新页面会重新构建：');
  console.error(error instanceof ContentValidationError ? error.message : error);
}

const server = http.createServer((request, response) => {
  if (dev) {
    try {
      const signature = contentSignature();
      if (signature !== lastSignature) {
        lastBuild = build({ quiet: true });
        lastSignature = signature;
        console.log('内容有变化，已重新构建。');
      }
    } catch (error) {
      console.error(error instanceof ContentValidationError ? error.message : error);
      sendErrorPage(response, error);
      return;
    }
  }

  const pathname = resolvePathname(request.url ?? '/');
  if (pathname === null) {
    sendNotFound(response);
    return;
  }

  let filePath = path.join(outDir, pathname.replace(/^\/+/, ''));
  if (filePath !== outDir && !filePath.startsWith(`${outDir}${path.sep}`)) {
    sendNotFound(response);
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendNotFound(response);
    return;
  }

  const type = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  response.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': dev ? 'no-store' : 'no-cache',
  });
  response.end(fs.readFileSync(filePath));
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `${dev ? '开发预览' : '构建预览'}：http://127.0.0.1:${port}${base || ''}/`,
  );
  console.log(dev ? '开发模式会显示草稿并标记，内容变化后刷新即可。' : '按 Ctrl+C 结束。');
});

server.on('error', (error) => {
  console.error(`无法启动预览服务：${error.message}`);
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

export { server };
