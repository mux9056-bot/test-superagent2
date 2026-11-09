# 验收记录

本记录对应需求文档 v1.0 的验收标准 A01–A20，记录本地实现与自动化检查结果。涉及正式域名、托管平台和真实内容的项目需要在部署后补充确认。

## 验收环境

- 日期：2026-11-05
- 系统：macOS（Darwin，Apple Silicon）
- Node.js：v22.22.3
- 浏览器：Playwright Chromium（headless）与 Playwright WebKit
- 站点地址：本地预览 `http://127.0.0.1:4321/`（占位域名 `https://example.com`）
- 自动化命令：
  - `npm run check` — 内容校验
  - `npm test` — 43 项单元与集成测试
  - `npm run build && npm run verify` — 154 项构建产物检查
  - `npm run browser-check` — 109 项浏览器检查，并生成 `docs/screenshots/`
  - `npm run lighthouse` — 移动端 Lighthouse，连续 3 次取中位数，结果写入 `docs/lighthouse.json`

## 验收结果

| 编号 | 验收场景 | 结果 | 证据 |
| --- | --- | --- | --- |
| A01 | 打开首页 | ✅ | `verify`：站名、介绍、导航、按日期倒序的文章列表；截图 `home-1440.jpg`、`home-768.jpg`、`home-375.jpg` |
| A02 | 超过 10 篇文章 | ✅ | 12 篇示例文章生成 2 页；`verify` 校验两页无重复、无遗漏、翻页链接可直接打开；`browser-check` 访问第 2 页返回 200 |
| A03 | 打开文章 | ✅ | `verify`：标题、发布日期、更新时间（`autumn-evening-walk` 显示 2026-11-05）、标签、正文；截图 `post-1440.jpg` |
| A04 | 查看 Markdown 示例文章 | ✅ | `verify`：标题层级、有序/无序列表、引用、链接、图片、代码块、表格、分隔线；示例文章 `why-i-write-again` |
| A05 | 手机阅读宽内容 | ✅ | `browser-check`：375px 下所有页面无横向溢出；代码块与表格容器 `overflow-x: auto` 局部滚动 |
| A06 | 查看文章底部 | ✅ | `verify`：最早文章隐藏上一篇、保留下一篇；中间文章两者都有；移动端相邻文章单列展示 |
| A07 | 查看归档和标签 | ✅ | `verify`：年份分组、文章总数、标签排序与数量；草稿不出现在归档、标签和标签页 |
| A08 | 修改 about.md | ✅ | 关于页正文、头像和联系方式全部来自 `content/about.md`；示例内容已渲染，构建无需改动页面代码 |
| A09 | 创建草稿 | ✅ | `npm run dev` 预览显示草稿并带「草稿」标记；正式构建不生成草稿详情、列表、标签、归档、RSS 和站点地图条目 |
| A10 | 输入错误元数据 | ✅ | `npm test`：缺少必填字段、非法日期（含 2026-02-30）、非法 slug、重复 slug、错误类型、未知字段均构建失败并指出文件与字段 |
| A11 | 引用不存在的本地图片或文章 | ✅ | `npm test`：不存在的图片、缺失替代文本、指向不存在文章、相对路径、指向草稿的链接均构建失败并指出位置 |
| A12 | 修改标题和文件名 | ✅ | `npm test`：文章 URL 只由 slug 决定，修改标题和文件名后 URL 不变 |
| A13 | 自动部署失败 | ⚠️ 待上线验证 | 工作流只在测试与构建校验通过后上传部署，失败不会产生新产物；托管平台保留上一次成功部署。需要在真实托管平台确认 |
| A14 | 打开无效路径 | ✅ | `browser-check`：未知路径返回 HTTP 404，展示 404 页面并可返回首页；截图 `notFound-1440.jpg` |
| A15 | 查看页面源代码 | ✅ | `verify`：每页唯一 canonical、独立 title/description、Open Graph 标题/摘要/图片/类型；文章页包含发布时间与标签 |
| A16 | 查看 RSS 和站点地图 | ✅ | `verify`：RSS 与 sitemap 使用配置域名、条目正确、草稿被排除；**正式域名上线后需再次确认地址** |
| A17 | 多端浏览 | ✅ | `browser-check`：375px、768px、1440px 三种视口下导航、文章、图片正常；Chromium 与 WebKit 均通过主要阅读流程。Safari/Edge 实机验证建议在验收时补充 |
| A18 | 键盘访问 | ✅ | `browser-check`：第一次 Tab 到「跳到正文」，随后依次到达导航入口，所有焦点样式可见 |
| A19 | 性能检查 | ✅ | `npm run lighthouse`：移动端默认配置，首页与典型文章页各连续 3 次取中位数，Performance 均为 100 |
| A20 | 按项目说明发布一篇新文 | ⚠️ 待作者确认 | 本地已按 README 流程用示例文章验证创建、预览、构建、校验；上线前需实际发布一篇作者内容并确认图片与链接 |

## 性能记录

运行方式：`npm run lighthouse`，Lighthouse 默认移动端配置（模拟 4G、CPU 降速 4 倍），首页与典型文章页各运行 3 次，取中位数。

| 页面 | 运行次数 | Performance（中位数） | Accessibility | Best Practices | SEO |
| --- | --- | --- | --- | --- | --- |
| 首页 `/` | 3 | 100 | 100 | 100 | 100 |
| 文章页 `/posts/why-i-write-again/` | 3 | 100 | 100 | 100 | 100 |

测试环境：macOS（Apple Silicon）、Google Chrome 156.0.8078.80 headless、本地静态预览服务、Lighthouse 13.6.0 默认移动端配置。原始记录见 `docs/lighthouse.json`。

## 视觉记录

截图由 `npm run browser-check` 生成，文件位于 `docs/screenshots/`。变更前站点地址 `https://mux9056-bot.github.io/test-superagent2/` 返回「Site not found」，作为基线截图保留在 `before-live-404.jpg`。

| 页面 | 视口 | 文件 |
| --- | --- | --- |
| 首页 | 375 / 768 / 1440 | `home-375.jpg`、`home-768.jpg`、`home-1440.jpg` |
| 文章详情（含代码块、表格、图片说明） | 375 / 1440 | `post-375.jpg`、`post-1440.jpg` |
| 归档 | 1440 | `archives-1440.jpg` |
| 标签列表 | 1440 | `tags-1440.jpg` |
| 标签详情 | 375 | `tag-375.jpg` |
| 关于我 | 375 | `about-375.jpg` |
| 404 | 1440 | `notFound-1440.jpg` |

## 上线前待补充

- 站名、作者昵称、一句话介绍、关于页真实内容
- 正式域名，以及 `site.config.mjs` 中的 `url` / `base`
- 是否公开头像和联系方式
- 确认或移除 12 篇示例文章和示例图片
- 托管平台配置、HTTPS、404 回退和自动部署开关
- Safari、Edge 实机浏览确认
