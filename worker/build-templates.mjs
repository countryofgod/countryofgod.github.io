/**
 * 把 server/views 下的 EJS 编译成 Workers 能跑的模板字面量模块。
 *
 * 为什么需要这一步：EJS 的编译期会 new Function()，而 Cloudflare Workers 禁用
 * eval / new Function，模板没法在运行时编译。所以在这里（Node 里）先编译成
 * 普通的 JS 函数，生成 worker/src/html.js。EJS 仍是唯一来源，改模板后重跑本脚本即可。
 *
 *   node worker/build-templates.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const views = join(root, 'server', 'views');

const EJS = /<%([=\-_]?)([\s\S]*?)%>/g;

/** 静态片段包成模板字面量，转义其中的 \ ` 与 ${ */
const tl = (s) => '`' + s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';

const FN = { 'article-item': 'articleItem', 'month-post': 'monthPost', 'archive-group': 'archiveGroup', 'guest-note': 'guestNote' };

/** include('partials/x', {…}) → x({…}) */
const inlineInclude = (expr) =>
  expr.replace(/include\(\s*['"](?:partials\/)?([^'"]+)['"]\s*,\s*(\{[\s\S]*?\})\s*\)/g, (_m, name, args) => {
    const fn = FN[name] || name;
    return `${fn}(${args})`;
  });

function compile(src, fnName, params) {
  let body = `function ${fnName}(${params}) {\n  let out = '';\n`;
  let last = 0;
  for (const m of src.matchAll(EJS)) {
    const stat = src.slice(last, m.index);
    if (stat) body += `  out += ${tl(stat)};\n`;
    const kind = m[1];
    const code = m[2];
    if (kind === '=') {
      body += `  out += esc(${inlineInclude(code.trim())});\n`;
    } else if (kind === '-' || kind === '_') {
      body += `  out += ${inlineInclude(code.trim())};\n`;
    } else {
      const lines = code.split('\n').map((l) => l.trim()).filter((l) => l);
      if (lines.length) body += lines.map((l) => `  ${l}`).join('\n') + '\n';
    }
    last = m.index + m[0].length;
  }
  const tail = src.slice(last);
  if (tail) body += `  out += ${tl(tail)};\n`;
  body += '  return out;\n}\n';
  return body;
}

const read = (p) => readFileSync(join(views, p), 'utf8');

const parts = [
  compile(read('partials/month-post.ejs'), 'monthPost', '{ post }'),
  compile(read('partials/article-item.ejs'), 'articleItem', '{ article }'),
  compile(read('partials/archive-group.ejs'), 'archiveGroup', '{ group, open }'),
  compile(read('partials/guest-note.ejs'), 'guestNote', '{ note }'),
  compile(read('index.ejs'), 'renderHome', '{ articles, archive, notes, submitMail }'),
  compile(read('article.ejs'), 'renderArticle', '{ article, archived, readable, echoes }'),
  compile(
    read('admin.ejs'),
    'renderAdmin',
    '{ authed, loginError, adminPath, articles, archiveEntries, notes, stats, daily }'
  ),
].join('\n');

/** 返回编译结果；不落盘。preflight 用它跟磁盘上的 html.js 比对，判断有没有过期 */
export function buildTemplates() {
  return `/* 自动生成，勿手改。
 * 来源：server/views/*.ejs —— 由 worker/build-templates.mjs 编译。
 * 原因：Cloudflare Workers 禁用 new Function，EJS 无法在运行时编译，
 *       所以在 Node 里先编译成普通函数。改模板请改 EJS 后重跑：
 *         node worker/build-templates.mjs
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** 与 EJS 的 <%= %> 同一套转义：用户输入一律先过这里 */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

${parts}
export { renderHome, renderArticle, renderAdmin, esc };
`;
}

// 只有直接执行才落盘；被 preflight import 时不能产生副作用
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dest = join(root, 'worker', 'src', 'html.js');
  const out = buildTemplates();
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, out, 'utf8');
  console.log('已生成', dest, out.length, '字符');
}
