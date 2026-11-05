# 我的博客

一个以生活随笔和个人介绍为主的静态个人博客。内容用本地 Markdown 维护，构建时自动校验，读者打开网页即可阅读，阅读过程不依赖客户端 JavaScript。

## 特性

- 首页、文章详情、归档、标签、关于我、404 页面
- 首页与标签页按发布日期倒序，同一日期按 slug 排序；每页 10 篇，翻页有独立 URL
- 文章支持标题层级与稳定锚点、段落、加粗、斜体、引用、列表、链接、图片、分隔线、代码块和表格
- 文末提供返回首页、上一篇（较早）和下一篇（较新），无对应文章时自动隐藏
- 构建时校验元数据、slug 唯一性、日期、草稿、本地图片和站内链接
- 草稿只在本地预览出现并标记，正式构建完全排除
- 响应式布局，手机端无横向溢出，代码块和宽表格在自身区域滚动
- 基础 SEO（title、description、canonical、Open Graph）、RSS、站点地图和 robots.txt
- 图片自动输出宽高，首张立即加载、其余延迟加载，避免布局跳动

## 环境要求

- Node.js >= 20.11
- npm

## 快速开始

```bash
npm install
npm run dev        # 本地预览：http://127.0.0.1:4321/（会显示草稿并标记）
```

构建与检查：

```bash
npm run check      # 只做内容校验，不写文件
npm run build      # 构建到 dist/（排除草稿）
npm run preview    # 预览构建产物：http://127.0.0.1:4321/
npm test           # 单元与集成测试
npm run verify     # 校验 dist/ 产物（分页、草稿隔离、RSS、sitemap、站内链接等）
npm run browser-check   # 浏览器检查并生成 docs/screenshots/ 截图（需要 Playwright 浏览器）
npm run lighthouse      # 移动端 Lighthouse，连续 3 次取中位数，写入 docs/lighthouse.json
```

首次运行浏览器相关脚本前安装浏览器：

```bash
npx playwright install chromium webkit
```

## 站点配置

所有站点级配置都在 [`site.config.mjs`](site.config.mjs)：

| 字段 | 说明 |
| --- | --- |
| `name` | 站名，显示在页头、标题和页脚 |
| `author` | 作者昵称，用于关于页描述 |
| `description` | 一句话介绍，显示在页头并作为默认描述 |
| `url` | 正式域名，用于 canonical、RSS、站点地图和分享图 |
| `base` | 部署在子路径时使用，例如 GitHub Pages 项目站点的 `/仓库名`；根域名留空 |
| `socials` | 公开的联系方式，数组项为 `{ label, url }`；留空则不展示 |
| `nav` | 导航项，与页面路由对应 |
| `postsPerPage` | 首页每页文章数，默认 10 |
| `rssLimit` | RSS 条目上限，默认 20 |

仓库中的站名、作者、介绍和域名是占位值。正式上线前需要替换为真实信息，并确认是否公开联系方式。`url` 必须使用正式域名，否则 canonical、RSS 和站点地图会指向占位域名。

## 写一篇文章

1. 复制 [`docs/post-template.md`](docs/post-template.md) 到 `content/posts/`，文件名可以随意，但建议与 slug 一致。
2. 填写 Front Matter（YAML）和正文。
3. 运行 `npm run dev` 检查排版和图片。
4. 确认 `draft: false` 后提交、推送，托管平台会自动构建发布。

Front Matter 字段：

| 字段 | 必填 | 规则 |
| --- | --- | --- |
| `title` | 是 | 非空文章标题 |
| `slug` | 是 | 全站唯一，小写英文字母、数字和连字符，不能以连字符开头或结尾；发布后保持不变 |
| `date` | 是 | 发布日期，`YYYY-MM-DD`；不能是未来日期（草稿除外） |
| `description` | 是 | 非空摘要，建议 50～120 个字符，用于列表和 SEO |
| `updated` | 否 | 更新日期，`YYYY-MM-DD`，不能早于 `date`；与 `date` 不同时页面会显示更新时间 |
| `tags` | 否 | 字符串数组，自动去除首尾空格并去重；标签中不能包含 `\ / ? # %` |
| `draft` | 否 | 布尔值，默认 `false`；`true` 表示草稿 |

示例：

```markdown
---
title: 周末，去公园坐了一下午
slug: an-afternoon-in-the-park
date: 2026-11-04
description: 没有安排特别的事，只是带着一本书，在公园里慢慢过完一个下午。
tags:
  - 日常
draft: false
---

午后的公园很安静。

![树荫下的长椅](/images/an-afternoon-in-the-park/bench.jpg "树荫下的长椅")
```

### 图片

- 图片放在 `public/images/` 下，正文用站点根路径引用，例如 `/images/an-afternoon-in-the-park/bench.jpg`。
- 图片必须填写替代文本（`![替代文本](...)`），否则构建失败。
- 可选的图片标题会显示为图片说明：`![替代文本](/images/a.jpg "说明文字")`。
- 构建时会读取图片宽高并写入 `<img>`；第一张图立即加载，其余图片延迟加载。
- 外链图片可以正常显示，但不会自动获得宽高信息。

### 草稿与预览

- `draft: true` 的文章只在 `npm run dev` 中显示，列表和详情页会带「草稿」标记。
- 正式构建（`npm run build`）不会生成草稿的详情页，也不会出现在首页、归档、标签、RSS 和站点地图中。
- 草稿中的正文和图片仍保存在仓库中，不会自动获得隐私保护；私密内容不要提交到公开仓库。
- 未来日期的文章必须标记为草稿，等到发布日再改为 `draft: false`。

### 链接与 slug

- 站内链接必须使用站点根路径，例如 `/posts/an-afternoon-in-the-park/`。
- 构建时会检查站内链接和本地图片，找不到目标或链接到草稿都会失败，并指出文件与行号。
- 文章 URL 由 slug 决定，修改标题或文件名不会改变链接；修改或删除已发布 slug 时，作者需要自行维护旧地址的重定向，并在发布说明中提醒这一约束。

## 目录结构

```text
content/
  posts/            Markdown 文章与 Front Matter
  about.md          关于页内容（title、avatar、socials 可选）
public/
  images/           随站点发布的图片
  favicon.svg
  og-default.png    默认分享图
lib/
  content.mjs       读取与校验内容
  markdown.mjs      Markdown 渲染、图片宽高、代码高亮
  render.mjs        页面模板
  site.mjs          构建流程、RSS、站点地图
  utils.mjs         日期、排序、分页、标签、图片尺寸等工具
styles/global.css   全站样式（构建时内联到页面）
scripts/            构建、预览、校验、截图与 Lighthouse 脚本
tests/              node:test 测试
docs/               模板、验收记录、截图与 Lighthouse 结果
```

## 部署

构建产物是纯静态文件，位于 `dist/`。任意支持静态托管、能返回自定义 404 的托管平台都可以使用；构建命令为 `npm ci && npm run build`，发布目录为 `dist/`。

### GitHub Pages

仓库带有 `.github/workflows/deploy.yml`：

1. 在仓库 Settings → Pages 中把 Source 设为 GitHub Actions。
2. 推送到 `main` 后，工作流会先运行测试和构建校验，再上传 `dist/` 并部署。
3. 项目站点地址为 `https://<owner>.github.io/<repo>/`：把 `site.config.mjs` 的 `url` 设为 `https://<owner>.github.io`，`base` 设为 `/<repo>`。使用自定义域名时，把 `url` 设为正式域名、`base` 留空。部署环境也可以通过 `SITE_URL`、`SITE_BASE` 覆盖这两个值。

### 其他托管平台

- Netlify、Vercel、Cloudflare Pages 等：构建命令 `npm ci && npm run build`，发布目录 `dist`；自定义域名后把 `site.config.mjs` 的 `url` 改为正式域名。
- 部署前请确认平台会把未知路径交给 `dist/404.html` 并返回 HTTP 404 状态。
- 正式域名需要启用 HTTPS。

### 回滚与失败处理

- 构建失败时不会产生新的部署产物；托管平台默认保留上一次成功部署的站点。
- 需要回滚时，在 Git 中回退到上一个成功发布的提交并重新推送，或使用托管平台的上一次成功部署。
- 构建失败的原因会出现在构建日志中，包含出错文件与字段，修正后重新提交即可。

## 已知限制

- 仓库中的 12 篇示例文章和示例图片是占位内容，上线前需要由作者确认、替换或移除。
- 站名、作者昵称、介绍、域名和联系方式仍待补充。
- 首版不包含网页写作后台、账号、多作者、评论、点赞、阅读量、会员、付费内容、站内搜索、定时发布、多语言和主题切换。
- 未接入访问统计；如后续需要，需单独评估隐私影响。
- 浏览器检查覆盖 Chromium 与 WebKit 引擎；Edge 与 Safari 的实机验证建议在验收时补充。

## 验收记录

自动化检查结果、截图位置、浏览器与 Lighthouse 记录见 [`docs/acceptance.md`](docs/acceptance.md)。
