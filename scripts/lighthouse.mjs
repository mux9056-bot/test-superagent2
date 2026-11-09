import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { site } from '../site.config.mjs';

const port = Number(process.env.LIGHTHOUSE_PORT || 4400);
const baseUrl = `http://127.0.0.1:${port}${site.base}`;
const projectRoot = path.resolve(import.meta.dirname, '..');
const runs = 3;
const targets = [
  { name: 'home', path: '/' },
  { name: 'article', path: '/posts/why-i-write-again/' },
];
const categories = ['performance', 'accessibility', 'best-practices', 'seo'];

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
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

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
});
let chrome;
try {
  await waitForServer();
  const chromePath = findChrome();
  if (!chromePath) throw new Error('未找到 Chrome，可通过 CHROME_PATH 指定');
  chrome = await chromeLauncher.launch({
    chromePath,
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });

  const report = {
    url: baseUrl,
    date: new Date().toISOString(),
    environment: {
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      chrome: chromePath,
      formFactor: 'mobile（Lighthouse 默认移动端配置）',
      runs,
    },
    pages: {},
  };

  for (const target of targets) {
    const scores = [];
    for (let index = 0; index < runs; index += 1) {
      const result = await lighthouse(`${baseUrl}${target.path}`, {
        port: chrome.port,
        output: 'json',
        logLevel: 'error',
        onlyCategories: categories,
      });
      const categoryScores = Object.fromEntries(
        categories.map((category) => [
          category,
          Math.round((result.lhr.categories[category]?.score ?? 0) * 100),
        ]),
      );
      scores.push(categoryScores);
      console.log(`${target.name} 第 ${index + 1} 次：${JSON.stringify(categoryScores)}`);
    }
    report.pages[target.name] = {
      path: target.path,
      scores,
      median: Object.fromEntries(
        categories.map((category) => [category, median(scores.map((score) => score[category]))]),
      ),
    };
  }

  fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'docs', 'lighthouse.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log('\n中位数：');
  for (const [name, page] of Object.entries(report.pages)) {
    console.log(`  ${name}：${JSON.stringify(page.median)}`);
  }
  const target = 90;
  const failed = Object.entries(report.pages).flatMap(([name, page]) =>
    Object.entries(page.median)
      .filter(([category, score]) => category === 'performance' && score < target)
      .map(([, score]) => `${name} Performance ${score} < ${target}`),
  );
  if (failed.length) {
    console.error(`性能目标未达到：${failed.join('；')}`);
    process.exitCode = 1;
  } else {
    console.log('性能目标（移动端 Performance ≥ 90）已达标。');
  }
} finally {
  if (chrome) await chrome.kill();
  server.kill('SIGTERM');
}
