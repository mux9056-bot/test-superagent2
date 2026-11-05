import path from 'node:path';
import process from 'node:process';
import { site } from '../site.config.mjs';
import { ContentValidationError } from '../lib/content.mjs';
import { buildSite } from '../lib/site.mjs';

const args = process.argv.slice(2);
const includeDrafts = args.includes('--drafts');
const outIndex = args.indexOf('--out');
const outDir = path.resolve(outIndex >= 0 ? args[outIndex + 1] : 'dist');

try {
  const result = buildSite({
    site,
    rootDir: process.cwd(),
    outDir,
    includeDrafts,
  });
  for (const warning of result.warnings) console.warn(`警告：${warning}`);
  const draftNote = result.stats.includedDrafts
    ? `，另有 ${result.stats.includedDrafts} 篇草稿（预览构建包含）`
    : '，草稿已排除';
  console.log(
    `构建完成：${result.stats.published} 篇已发布文章${draftNote}，${result.stats.tags} 个标签，${result.pages.length} 个页面。`,
  );
  console.log(`输出目录：${path.relative(process.cwd(), outDir) || '.'}`);
  if (site.url === 'https://example.com') {
    console.warn(
      '提示：site.config.mjs 中的 url 还是示例域名，canonical、RSS 和站点地图会在上线前指向它，请替换为正式域名。',
    );
  }
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error('构建失败：内容校验未通过。');
    for (const item of error.errors) console.error(`- ${item}`);
    for (const warning of error.warnings) console.warn(`警告：${warning}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
