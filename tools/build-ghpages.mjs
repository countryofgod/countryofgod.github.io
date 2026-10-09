// 生成 github.io（GitHub Pages）用的静态首页 index.html。
//
// 为什么需要这一步：
//   Worker 以 public/ 为站点根，所以模板里写的是 /css/site.css、/img/x.webp 这类绝对路径；
//   GitHub Pages 以仓库根目录为站点根，同样的路径会解析到 github.io/css/site.css（不存在）。
//   因此这里把所有 /css /js /img /fonts /daily 的绝对路径改写成 /public/... ，
//   并把外置样式内联进去（内联后 CSS 内部的 url('/fonts/...') 也一并改写）。
//
// 用法：node tools/build-ghpages.mjs
import { writeFile } from 'node:fs/promises';

const BASE = 'https://gods-country.countryofgod.workers.dev';

async function mustGet(path) {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`取 ${path} 失败：HTTP ${res.status}`);
  return res.text();
}

// 1) 取当前线上首页（美术馆、档案馆、留言墙等板块与真实数据都在里面）
let html = await mustGet('/');

// 2) 取样式并改写其中的字体 / 图片引用
const css = (await mustGet('/css/site.css')).replace(
  /url\((['"]?)\/(fonts|img)\//g,
  'url($1/public/$2/'
);

// 3) 外置样式改内联
html = html.replace(
  '<link rel="stylesheet" href="/css/site.css">',
  '<style>\n' + css + '\n</style>'
);

// 4) 页面里的脚本 / 图片 / 字体 / 每日内容路径统一加 /public 前缀
html = html
  .replace(/(src|href)="\/js\//g, '$1="/public/js/')
  .replace(/(src|href)="\/img\//g, '$1="/public/img/')
  .replace(/(src|href)="\/fonts\//g, '$1="/public/fonts/')
  .replace(/(src|href)="\/daily\//g, '$1="/public/daily/');

// 5) 留言图片、/random、文章页都是 Worker 的路由，静态页上没有，指回 Worker
html = html
  .replace(/(src|href)="\/api\//g, `$1="${BASE}/api/`)
  .replace(/href="\/random"/g, `href="${BASE}/random"`)
  .replace(/href="\/article\//g, `href="${BASE}/article/`);

// 6) 静态页没有后端：告诉 site.js 把留言接口指回 Worker（跨域 + 带凭据，见 worker/src/index.js 的 CORS 段）
html = html.replace(
  '<script src="/public/js/site.js"></script>',
  `<script>window.__API_BASE__='${BASE}';window.__DAILY_BASE__='/public/daily/';</script>\n  <script src="/public/js/site.js"></script>`
);

await writeFile(new URL('../index.html', import.meta.url), html, 'utf8');

console.log('已生成 index.html');
console.log('  字节数：', Buffer.byteLength(html));
for (const kw of ['museum', '美术馆', '档案馆', 'archive', '留言']) {
  console.log(`  含「${kw}」：`, html.includes(kw));
}
