import process from 'node:process';
import { site } from '../site.config.mjs';
import { ContentValidationError } from '../lib/content.mjs';
import { buildSite } from '../lib/site.mjs';

try {
  const result = buildSite({
    site,
    rootDir: process.cwd(),
    write: false,
  });
  for (const warning of result.warnings) console.warn(`警告：${warning}`);
  console.log(
    `内容校验通过：${result.stats.published} 篇已发布文章，${result.stats.drafts} 篇草稿（正式构建会排除），${result.stats.tags} 个标签。`,
  );
  console.log(`渲染页面：${result.pages.length} 个；站内链接与本地图片引用均可解析。`);
} catch (error) {
  if (error instanceof ContentValidationError) {
    console.error('内容校验未通过。');
    for (const item of error.errors) console.error(`- ${item}`);
    for (const warning of error.warnings) console.warn(`警告：${warning}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
