// 站点配置：站名、作者、介绍、域名等集中在这里维护。
//
// 上线前需要替换的内容（对应需求文档第 12 节）：
//   name        站名
//   author      作者昵称
//   description 一句话介绍
//   url         正式域名（不要带结尾斜杠）
//   socials     公开的联系方式；留空则不展示
//
// SITE_URL / SITE_BASE 仅供部署环境覆盖，本地开发不需要设置。
// 部署在 GitHub Pages 项目站点时，SITE_BASE 形如 /仓库名。

const rawUrl = process.env.SITE_URL || 'https://example.com';
const rawBase = process.env.SITE_BASE || '';

function normalizeBase(value) {
  const trimmed = value.replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}` : '';
}

export const site = {
  name: '我的博客',
  author: '博主',
  description: '记录生活随笔与个人介绍的个人博客。',
  url: rawUrl.replace(/\/+$/, ''),
  base: normalizeBase(rawBase),
  language: 'zh-CN',
  locale: 'zh_CN',
  postsPerPage: 10,
  rssLimit: 20,
  // 只展示填写了链接的平台，例如：
  // socials: [{ label: 'GitHub', url: 'https://github.com/your-name' }],
  socials: [],
  nav: [
    { label: '首页', path: '/', section: 'home' },
    { label: '归档', path: '/archives/', section: 'archives' },
    { label: '标签', path: '/tags/', section: 'tags' },
    { label: '关于我', path: '/about/', section: 'about' },
  ],
};
