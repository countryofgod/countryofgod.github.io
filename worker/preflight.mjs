/**
 * 部署自检：在 wrangler deploy 之前把"上线了但其实是坏的"那几类问题挡下来。
 *
 *   node worker/preflight.mjs
 *
 * 检查项都是真实的失败来源，不是形式主义：
 *   1. 模板过期 —— html.js 是从 EJS 编译来的，忘了重编译就会上线旧页面（真的发生过）
 *   2. D1 database_id 还是占位符 —— 部署上去接口全 500
 *   3. 模板里引用的静态资源不存在 —— 页面能开，但图裂、字错、样式丢
 *   4. Node 版本不够 —— node:sqlite 与 --env-file-if-exists 都要 22.9+
 *   5. 管理口令没来源 —— 上线后进不去 /admin
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplates } from './build-templates.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let fail = 0;
const ok = (msg) => console.log(' ok   ' + msg);
const bad = (msg, how) => {
  fail += 1;
  console.log('FAIL  ' + msg);
  if (how) console.log('      修法：' + how);
};
// 提醒不算失败：生产口令在 Cloudflare 的 secret 里，本机本来就查不到
const warn = (msg) => console.log('warn  ' + msg);

/* 1. 模板是否过期 */
const htmlPath = join(root, 'worker', 'src', 'html.js');
const current = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf8') : null;
const fresh = buildTemplates();
if (current === fresh) ok('worker/src/html.js 与 EJS 同步');
else bad('worker/src/html.js 已过期（EJS 改过但没重编译）', 'npm run templates');

/* 2. wrangler 配置 */
const wranglerPath = join(root, 'wrangler.jsonc');
const wranglerText = existsSync(wranglerPath) ? readFileSync(wranglerPath, 'utf8') : '';
if (!wranglerText) bad('找不到 wrangler.jsonc');
else {
  if (wranglerText.includes('REPLACE_WITH_YOUR_D1_DATABASE_ID')) {
    bad('D1 的 database_id 还是占位符', 'npm run d1:create，把输出的 id 填回 wrangler.jsonc');
  } else ok('D1 database_id 已填');

  if (!/bucket_name"\s*:\s*"[^"]+"/.test(wranglerText)) bad('R2 桶名缺失');
  else ok('R2 桶已配置');

  if (!/directory"\s*:\s*"\.\/public"/.test(wranglerText)) bad('静态资源目录未指向 ./public');
  else ok('静态资源目录指向 ./public');
}

/* 3. 模板引用的静态资源是否都在 */
const views = join(root, 'server', 'views');
const referenced = new Set();
for (const file of ['index.ejs', 'article.ejs', 'admin.ejs']) {
  const p = join(views, file);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, 'utf8');
  for (const m of text.matchAll(/(?:src|href)="(\/(?:img|css|js|fonts)\/[^"]+)"/g)) referenced.add(m[1]);
  for (const m of text.matchAll(/url\('(\/(?:img|fonts)\/[^']+)'\)/g)) referenced.add(m[1]);
}
const cssText = existsSync(join(root, 'public', 'css', 'site.css'))
  ? readFileSync(join(root, 'public', 'css', 'site.css'), 'utf8')
  : '';
for (const m of cssText.matchAll(/url\('(\/(?:img|fonts)\/[^']+)'\)/g)) referenced.add(m[1]);

const missing = [...referenced].filter((p) => !existsSync(join(root, 'public', p.replace(/^\//, ''))));
if (missing.length) bad(`模板/CSS 引用的 ${missing.length} 个资源不存在：${missing.join(', ')}`);
else ok(`${referenced.size} 个被引用的静态资源都在`);

/* 4. Node 版本 */
const major = Number(process.versions.node.split('.')[0]);
const minor = Number(process.versions.node.split('.')[1]);
if (major > 22 || (major === 22 && minor >= 9)) ok(`Node ${process.versions.node}`);
else bad(`Node ${process.versions.node} 太低，需要 >= 22.9`, '升级 Node');

/* 5. 管理口令 —— 生产环境存在 Cloudflare secret 里，本机查不到，所以只提醒 */
if (process.env.ADMIN_PASSWORD) ok('本机 ADMIN_PASSWORD 已设置');
else if (existsSync(join(root, '.dev.vars'))) ok('.dev.vars 里有本地口令');
warn('确认已执行过 npx wrangler secret put ADMIN_PASSWORD —— 否则线上进不了 /admin');

/* 6. 图片存哪儿 —— 三种来源都没有就会变成"能留言不能发图" */
if (process.env.IMGBB_API_KEY) ok('IMGBB_API_KEY 已设置，图片走图床');
else if (!wranglerText.includes('// "r2_buckets"')) ok('R2 绑定已启用，图片存自己的桶');
else warn('图片没有落点：带图留言会返回 503。去面板启用 R2，或配一个 IMGBB_API_KEY');

console.log(fail ? `\n${fail} 项未通过，先修再部署。` : '\n全部通过，可以部署。');
process.exit(fail ? 1 : 0);
