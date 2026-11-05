import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { chromium, webkit } from 'playwright';
import { site } from '../site.config.mjs';

const port = Number(process.env.BROWSER_CHECK_PORT || 4399);
const baseUrl = `http://127.0.0.1:${port}${site.base}`;
const projectRoot = path.resolve(import.meta.dirname, '..');
const screenshotDir = path.join(projectRoot, 'docs', 'screenshots');
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

async function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // 服务尚未启动。
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('预览服务启动超时');
}

const pages = {
  home: '/',
  post: '/posts/why-i-write-again/',
  archives: '/archives/',
  tags: '/tags/',
  tag: `/tags/${encodeURIComponent('日常')}/`,
  about: '/about/',
  notFound: '/404.html',
};

const viewports = [
  { name: '375', width: 375, height: 812 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

const screenshots = [
  ['home', '375'],
  ['home', '768'],
  ['home', '1440'],
  ['post', '375'],
  ['post', '1440'],
  ['archives', '1440'],
  ['tags', '1440'],
  ['tag', '375'],
  ['about', '375'],
  ['notFound', '1440'],
];

fs.mkdirSync(screenshotDir, { recursive: true });

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});

let browser;
try {
  await waitForServer();

  browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'zh-CN' });
  const page = await context.newPage();

  for (const [name, route] of Object.entries(pages)) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
      check(
        `页面可访问：${name} @ ${viewport.name}`,
        Boolean(response && response.status() === 200),
        response ? `HTTP ${response.status()}` : '无响应',
      );
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        navVisible: (() => {
          const nav = document.querySelector('.site-nav');
          if (!nav) return false;
          const box = nav.getBoundingClientRect();
          return box.width > 0 && box.height > 0 && box.right <= window.innerWidth + 1;
        })(),
        h1Count: document.querySelectorAll('h1').length,
        main: Boolean(document.querySelector('main#main')),
        bodyFontSize: parseFloat(getComputedStyle(document.body).fontSize),
      }));
      check(
        `无横向溢出：${name} @ ${viewport.name}`,
        layout.scrollWidth <= layout.innerWidth + 1,
        `${layout.scrollWidth} > ${layout.innerWidth}`,
      );
      check(`导航可用：${name} @ ${viewport.name}`, layout.navVisible);
      check(`语义结构：${name} @ ${viewport.name}`, layout.h1Count === 1 && layout.main);
      if (viewport.name === '375') {
        check(`手机正文字号不小于 16px：${name}`, layout.bodyFontSize >= 16, `${layout.bodyFontSize}px`);
      }
    }
  }

  for (const [name, viewportName] of screenshots) {
    const viewport = viewports.find((item) => item.name === viewportName);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${baseUrl}${pages[name]}`, { waitUntil: 'load' });
    await page.screenshot({
      path: path.join(screenshotDir, `${name}-${viewportName}.jpg`),
      fullPage: true,
      type: 'jpeg',
      quality: 85,
    });
  }
  check('截图已生成', screenshots.every(([name, viewportName]) => fs.existsSync(path.join(screenshotDir, `${name}-${viewportName}.jpg`))));

  // 正文宽度、代码块与表格滚动
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${pages.post}`, { waitUntil: 'load' });
  const measure = await page.evaluate(() => {
    const body = document.querySelector('.post-body');
    return body ? body.getBoundingClientRect().width : 0;
  });
  check('桌面正文宽度不超过 720px', measure <= 720, `${measure}px`);

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${baseUrl}${pages.post}`, { waitUntil: 'load' });
  const scrolling = await page.evaluate(() => {
    const code = document.querySelector('pre.code-block');
    const table = document.querySelector('.table-wrap');
    return {
      codeOverflow: code ? getComputedStyle(code).overflowX : null,
      tableOverflow: table ? getComputedStyle(table).overflowX : null,
      imagesSized: [...document.querySelectorAll('.post-body img')].every(
        (image) => image.getAttribute('width') && image.getAttribute('height'),
      ),
      imagesLoaded: [...document.querySelectorAll('.post-body img')].every((image) => image.naturalWidth > 0),
      headingId: Boolean(document.getElementById('为什么又开始写')),
    };
  });
  check('代码块自身横向滚动', scrolling.codeOverflow === 'auto');
  check('宽表格自身横向滚动', scrolling.tableOverflow === 'auto');
  check('正文图片带宽高且加载成功', scrolling.imagesSized && scrolling.imagesLoaded);
  check('标题锚点可定位', scrolling.headingId);

  // 键盘访问：第一个焦点是跳转链接，随后到达导航，焦点样式可见
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${baseUrl}${pages.home}`, { waitUntil: 'load' });
  const focusOrder = [];
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press('Tab');
    focusOrder.push(
      await page.evaluate(() => {
        const element = document.activeElement;
        if (!element) return null;
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          text: (element.textContent || '').trim().slice(0, 12),
          href: element.getAttribute('href'),
          outlineStyle: style.outlineStyle,
          outlineWidth: parseFloat(style.outlineWidth),
          visible: box.width > 0 && box.height > 0,
        };
      }),
    );
  }
  const first = focusOrder[0];
  check('第一次 Tab 到达跳到正文链接', Boolean(first && first.href === '#main'));
  check(
    '所有键盘焦点可见',
    focusOrder.every(
      (item) => item && item.visible && item.outlineStyle !== 'none' && item.outlineWidth > 0,
    ),
    JSON.stringify(focusOrder),
  );
  check(
    'Tab 可依次到达导航入口',
    ['首页', '归档', '标签', '关于我'].every((label) =>
      focusOrder.some((item) => item && item.text === label),
    ),
  );
  check(
    '跳转链接有落点',
    Boolean(await page.evaluate(() => document.getElementById('main'))),
  );

  // 404 与错误路径
  const notFoundResponse = await fetch(`${baseUrl}/no-such-page/`);
  check('无效路径返回 HTTP 404', notFoundResponse.status === 404, `HTTP ${notFoundResponse.status}`);
  check('无效路径展示 404 页面', (await notFoundResponse.text()).includes('页面不存在'));

  const tagResponse = await fetch(`${baseUrl}${pages.tag}`);
  check('中文标签路径可访问', tagResponse.status === 200, `HTTP ${tagResponse.status}`);

  const missingTagResponse = await fetch(`${baseUrl}${site.base}${encodeURI('/tags/不存在的标签/')}`);
  check('不存在的标签返回 HTTP 404', missingTagResponse.status === 404, `HTTP ${missingTagResponse.status}`);

  const rssResponse = await fetch(`${baseUrl}/rss.xml`);
  check('RSS 以 XML 返回', rssResponse.status === 200 && (rssResponse.headers.get('content-type') || '').includes('xml'));

  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  check('站点地图可访问', sitemapResponse.status === 200);

  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  check('robots.txt 可访问', robotsResponse.status === 200);

  // WebKit 引擎（Safari 内核）走一遍主要阅读流程
  const webkitBrowser = await webkit.launch();
  try {
    const webkitPage = await webkitBrowser.newPage({ viewport: { width: 375, height: 812 } });
    let webkitOk = true;
    for (const route of [pages.home, pages.post, pages.archives, pages.tags, pages.about]) {
      const webkitResponse = await webkitPage.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
      const overflow = await webkitPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      if (!webkitResponse || webkitResponse.status() !== 200 || !overflow) webkitOk = false;
    }
    check('WebKit 引擎下主要页面可阅读且无横向溢出', webkitOk);
  } finally {
    await webkitBrowser.close();
  }

  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}

console.log(`\n${checks} 项浏览器检查，${failures.length} 项失败。`);
if (failures.length) {
  console.error('浏览器检查失败：');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`浏览器检查通过，截图位于 ${path.relative(projectRoot, screenshotDir)}/。`);
