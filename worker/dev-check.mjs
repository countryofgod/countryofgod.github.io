/**
 * 本地验 Workers 代码：用 node:sqlite 模拟 D1、用 Map 模拟 R2，直接调 worker 的 fetch。
 * 用途：本机 workerd 起不来时（Windows VC++ 运行库问题）也能验证路由/查询/模板。
 *   node worker/dev-check.mjs
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, rmSync } from 'node:fs';

// 测试口令：不硬编码真实口令，默认用假值占位；需要指定时用环境变量覆盖
//   PowerShell:  $env:ADMIN_PASSWORD='你的口令'; node worker/dev-check.mjs
const TEST_PASSWORD = process.env.ADMIN_PASSWORD || 'test-password';
process.env.ADMIN_PASSWORD = TEST_PASSWORD;

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');

class Stmt {
  constructor(sql) {
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args.map((a) => (a instanceof Uint8Array ? Buffer.from(a) : a));
    return this;
  }
  // 真实 D1 的这三个方法都返回 Promise，模拟层保持一致
  run() {
    const r = sqlite.prepare(this.sql).run(...this.args);
    return Promise.resolve({
      success: true,
      meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) },
    });
  }
  all() {
    const rows = sqlite.prepare(this.sql).all(...this.args);
    return Promise.resolve({ success: true, results: rows.map((r) => ({ ...r })) });
  }
  first() {
    const row = sqlite.prepare(this.sql).get(...this.args);
    return Promise.resolve(row ? { ...row } : null);
  }
}

const DB = {
  prepare: (sql) => new Stmt(sql),
  batch: async (stmts) => Promise.all(stmts.map((s) => s.run())),
};

const store = new Map();
const IMAGES = {
  put: async (key, data, opts) =>
    void store.set(key, { data, mime: opts?.httpMetadata?.contentType || 'application/octet-stream' }),
  get: async (key) => {
    const o = store.get(key);
    return o ? { body: o.data, httpMetadata: { contentType: o.mime } } : null;
  },
  delete: async (key) => void store.delete(key),
};

const env = {
  DB,
  IMAGES,
  ASSETS: { fetch: async () => new Response('', { status: 404 }) },
  ADMIN_PASSWORD: TEST_PASSWORD,
  SUBMIT_MAIL: 'afterrainnn@outlook.com',
  SESSION_TTL_DAYS: '7',
};

const worker = (await import('./src/index.js')).default;
const call = (path, init) => worker.fetch(new Request(`http://x${path}`, init), env, {});

let pass = 0;
let fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? ' ok ' : 'FAIL'}  ${name}${extra ? '  → ' + extra : ''}`);
  ok ? pass++ : fail++;
};

/* ---------- 结构比对 ---------- */
const TOKEN = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/g;
function tokenize(html) {
  const out = [];
  for (const m of html.matchAll(TOKEN)) {
    const raw = m[0];
    if (raw.startsWith('<!--')) continue;
    if (raw.startsWith('<')) {
      const closing = raw[1] === '/';
      const body = raw.slice(closing ? 2 : 1, raw.endsWith('/>') ? -2 : -1).trim();
      const nm = body.match(/^[^\s/>]+/);
      const name = (nm ? nm[0] : '').toLowerCase();
      const attrs = [];
      for (const a of body.slice(name.length).matchAll(/([^\s=]+)(?:="([^"]*)"|='([^']*)'|=([^\s]+))?/g)) {
        attrs.push([a[1].toLowerCase(), (a[2] ?? a[3] ?? a[4] ?? '').replace(/\s+/g, ' ').trim()]);
      }
      attrs.sort((x, y) => (x[0] < y[0] ? -1 : 1));
      out.push(`${closing ? '/' : ''}${name} ${attrs.map((a) => `${a[0]}=${a[1]}`).join(' ')}`);
    } else {
      const t = raw.replace(/\s+/g, ' ').trim();
      if (t) out.push(`#text(${t})`);
    }
  }
  return out;
}
const bodyOf = (h) => h.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];

const homeRes = await call('/');
check('GET / 200 html', homeRes.status === 200 && homeRes.headers.get('content-type').includes('text/html'));
const homeHtml = await homeRes.text();

/** 对齐两个 token 序列，输出只在左边 / 只在右边的项 */
function diffTokens(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const only = [];
  const added = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) only.push(a[i++]);
    else added.push(b[j++]);
  }
  while (i < n) only.push(a[i++]);
  while (j < m) added.push(b[j++]);
  return { only, added, common: dp[0][0] };
}

/* ---------- 设备即账号 ---------- */
const devSetCookie = homeRes.headers.get('set-cookie') || '';
check('首页给新设备登记身份', devSetCookie.startsWith('gc_dev='), devSetCookie.split(';')[0].slice(0, 24));
const devCookie = devSetCookie.split(';')[0];
// 标签里的字被拆成单字 span，不能按整串匹配，取标签那一段来判断
const labelSeg = homeHtml.slice(homeHtml.indexOf('footer-guestbook-label'));
const labelText = labelSeg.slice(0, labelSeg.indexOf('footer-guestbook-arrow'));
check(
  '底部标签已从「留言板」改为「留言」',
  labelText.includes('>留<') && labelText.includes('>言<') && !labelText.includes('>板<')
);

const mine0 = await (await call('/api/guestbook/mine', { headers: { Cookie: devCookie } })).json();
check('/mine 空态', Array.isArray(mine0.ids) && mine0.ids.length === 0 && mine0.nickname === null);

// 第二台设备：不带 cookie 再访问一次就是一个新身份
const otherCookie = ((await call('/')).headers.get('set-cookie') || '').split(';')[0];
check('换设备就是新身份', otherCookie.startsWith('gc_dev=') && otherCookie !== devCookie);

// 同时起一份 Node 版（Express + node:sqlite），两边渲染结果必须逐 token 相同
// 用 localhost 连而不是 127.0.0.1：个别环境（本机这台 Windows 就是）IPv4 回环地址不可用
// （connect EADDRNOTAVAIL），IPv6 的 localhost 正常；在双栈正常的机器上两种写法等价
process.env.PORT = '3114';
await import('../server/app.js');
const nodeHomeRes = await fetch('http://localhost:3114/');
const nodeHome = await nodeHomeRes.text();
check('Node 版同样登记设备', (nodeHomeRes.headers.getSetCookie() || []).some((c) => c.startsWith('gc_dev=')));
const vsNode = diffTokens(tokenize(bodyOf(nodeHome)), tokenize(bodyOf(homeHtml)));
console.log(`\nWorkers 版 vs Node 版：公共 ${vsNode.common}，仅 Node ${vsNode.only.length}，仅 Workers ${vsNode.added.length}`);
vsNode.only.forEach((s) => console.log('   -', s.slice(0, 120)));
vsNode.added.forEach((s) => console.log('   +', s.slice(0, 120)));
check('Workers 版与 Node 版输出逐 token 一致', vsNode.only.length === 0 && vsNode.added.length === 0);

const vsLegacy = diffTokens(tokenize(bodyOf(readFileSync('index.legacy.html', 'utf8'))), tokenize(bodyOf(homeHtml)));
console.log(`\n与 index.legacy.html 的差异（仅作参考）：仅旧页 ${vsLegacy.only.length}，仅新页 ${vsLegacy.added.length}`);
vsLegacy.only.forEach((s) => console.log('   -', s.slice(0, 110)));
vsLegacy.added.forEach((s) => console.log('   +', s.slice(0, 110)));

/* ---------- 公开接口 ---------- */
for (const p of ['/api/articles', '/api/articles/chuangkanhao', '/api/archive', '/api/guestbook']) {
  const r = await call(p);
  check(`GET ${p}`, r.status === 200);
}
check('404 走静态兜底', (await call('/nope')).status === 404);

/* ---------- 鉴权 ---------- */
const bad = await call('/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'x' }),
});
check('错误口令 401', bad.status === 401);

const login = await call('/admin/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: TEST_PASSWORD }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
check('正确口令 → Set-Cookie', cookie.startsWith('gc_admin='), cookie.slice(0, 20));

const adminPage = await call('/admin', { headers: { Cookie: cookie } });
const adminHtml = await adminPage.text();
check('管理页已登录视图', adminHtml.includes('退出'));
check('未登录只出登录框', !(await (await call('/admin')).text()).includes('退出'));

const A = (path, method, body) =>
  call(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

check('未登录写文章 401', (await call('/api/articles', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'x', excerpt: 'x', content: 'x' }),
})).status === 401);

/* ---------- 文章 / 档案馆 ---------- */
let r = await A('/api/articles', 'POST', {
  title: '第二期', author: '编辑部', publishedAt: '2026-11-08', category: '随笔',
  excerpt: '摘要。', content: '正文<br><br>两段', sortOrder: 1,
});
check('新建文章 201', r.status === 201 && !!r.body.slug, r.body?.slug);
const artId = r.body.id;
r = await A(`/api/articles/${artId}`, 'PUT', {
  title: '第二期（修订）', author: '编辑部', publishedAt: '2026-11-08',
  category: '随笔', excerpt: '改过。', content: '改过', sortOrder: 1,
});
check('更新文章', r.status === 200 && r.body.title === '第二期（修订）');
r = await A('/api/archive', 'POST', { year: 2026, month: 11, articleId: artId });
check('档案馆新增 201', r.status === 201, JSON.stringify(r.body));
const entryId = r.body.id;
r = await A('/api/archive', 'POST', { year: 2026, month: 11, articleId: artId });
check('重复条目 400', r.status === 400, r.body?.error);
r = await A('/api/archive', 'POST', { year: 2026, month: 13, articleId: artId });
check('月份越界 400', r.status === 400, r.body?.error);

// 收录后不改
r = await A(`/api/articles/${artId}`, 'PUT', {
  title: '改一下试试', author: '编辑部', publishedAt: '2026-11-08',
  category: '随笔', excerpt: '改过。', content: '改过', sortOrder: 1,
});
check('收录后不改 → 409', r.status === 409, r.body?.error);

/* ---------- 文章永久页 ---------- */
const seedId = (await (await call('/api/articles')).json()).find((a) => a.slug === 'chuangkanhao').id;
const p1 = await call('/p/chuangkanhao');
const p1Html = await p1.text();
check('永久页 200', p1.status === 200);
check('半年内可直接读全文', p1Html.includes('所谓上帝之国') && !p1Html.includes('沉入档案馆'));

const rnd = await call('/random', { redirect: 'manual' });
const rndTo = rnd.headers.get('location') || '';
check('/random 跳到某一篇', rnd.status === 303 && /\/p\/[^/]+\?r=1$/.test(rndTo), rndTo);

// 一篇很早的文章：主动打开只剩「已入档」，随机翻到才展开全文
const oldArt = await A('/api/articles', 'POST', {
  title: '旧文', author: '编辑部', publishedAt: '2020-01-08', category: '随笔',
  excerpt: '很久以前。', content: '旧文正文。', sortOrder: 9,
});
const oldSlug = oldArt.body.slug;
const oldHtml = await (await call(`/p/${oldSlug}`)).text();
check('超半年只剩已入档视图', oldHtml.includes('沉入档案馆') && !oldHtml.includes('旧文正文'));
const oldRandomHtml = await (await call(`/p/${oldSlug}?r=1`)).text();
check('随机能翻到旧文全文', oldRandomHtml.includes('旧文正文'));
check('永久页 404', (await call('/p/nope-nope')).status === 404);

/* ---------- 回声：一台设备一篇一次 ---------- */
const postEcho = (cookie) =>
  call('/api/echoes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ articleId: seedId, name: '访客甲', body: '我也这样想过' }),
  });
check('留回声 201', (await postEcho(devCookie)).status === 201);
check('同一篇第二次留 → 409', (await postEcho(devCookie)).status === 409);
const myEcho = await (await call(`/api/echoes/mine?article=${seedId}`, { headers: { Cookie: devCookie } })).json();
check('/echoes/mine 认领到', !!myEcho.echo && myEcho.echo.body === '我也这样想过');
check('别的设备没留过', (await (await call(`/api/echoes/mine?article=${seedId}`, { headers: { Cookie: otherCookie } })).json()).echo === null);
check('回声列表可见', (await (await call(`/api/echoes?article=${seedId}`)).json()).items.length === 1);
check(
  '别人撤回 → 403',
  (await call(`/api/echoes/${myEcho.echo.id}`, { method: 'DELETE', headers: { Cookie: otherCookie } })).status === 403
);
check(
  '本人撤回 → 200',
  (await call(`/api/echoes/${myEcho.echo.id}`, { method: 'DELETE', headers: { Cookie: devCookie } })).status === 200
);
check('撤回后可以重留', (await postEcho(devCookie)).status === 201);
const echoList = await (await call(`/api/echoes?article=${seedId}`)).json();
await call(`/api/echoes/${echoList.items[0].id}`, { method: 'DELETE', headers: { Cookie: devCookie } });

/* ---------- 写到一半 ---------- */
const putDraft = await call('/api/drafts', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Cookie: devCookie },
  body: JSON.stringify({ slot: 'guestbook', name: '甲', body: '写到一半' }),
});
check('存草稿 200', putDraft.status === 200);
const gotDraft = await (await call('/api/drafts?slot=guestbook', { headers: { Cookie: devCookie } })).json();
check('取回草稿', gotDraft.draft && gotDraft.draft.body === '写到一半' && gotDraft.draft.name === '甲');
const otherDraft = await (await call('/api/drafts?slot=guestbook', { headers: { Cookie: otherCookie } })).json();
check('草稿不串设备', !otherDraft.draft);
await call('/api/drafts?slot=guestbook', { method: 'DELETE', headers: { Cookie: devCookie } });
check('删草稿', !(await (await call('/api/drafts?slot=guestbook', { headers: { Cookie: devCookie } })).json()).draft);

await A(`/api/articles/${oldArt.body.id}`, 'DELETE');

/* ---------- 留言 + 图片 ---------- */
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);
const fd = new FormData();
fd.append('name', '访客甲');
fd.append('body', '写得真好');
fd.append('image', new File([png], 'a.png', { type: 'image/png' }));
const gr = await call('/api/guestbook', { method: 'POST', body: fd, headers: { Cookie: devCookie } });
const note = await gr.json();
check('带图留言 201', gr.status === 201 && !!note.imageUrl, note.imageUrl);

const img = await call(note.imageUrl);
const buf = Buffer.from(await img.arrayBuffer());
check(
  'R2 图片可取回且一致',
  img.status === 200 && img.headers.get('content-type') === 'image/png' && buf.equals(png),
  `${img.status} ct=${img.headers.get('content-type')} 取回 ${buf.length}B / 原 ${png.length}B`
);

const empty = new FormData();
empty.append('name', '');
empty.append('body', '');
check('空内容 400', (await call('/api/guestbook', { method: 'POST', body: empty })).status === 400);

const big = new FormData();
big.append('body', '大');
big.append('image', new File([new Uint8Array(6 * 1024 * 1024)], 'b.png', { type: 'image/png' }));
check('超 5MB 被拒', (await call('/api/guestbook', { method: 'POST', body: big })).status === 400);

const txt = new FormData();
txt.append('body', 'x');
txt.append('image', new File(['x'], 'a.txt', { type: 'text/plain' }));
check('非图片 MIME 400', (await call('/api/guestbook', { method: 'POST', body: txt })).status === 400);

const home2 = await (await call('/')).text();
check('首页 SSR 含新留言', home2.includes('写得真好') && home2.includes(note.imageUrl));
check('空态已消失', !home2.includes('guest-wall-empty'));
check('档案馆 11 月出现', (home2.match(/has-posts/g) || []).length === 2);

/* ---------- 归属与撤回 ---------- */
const mine1 = await (await call('/api/guestbook/mine', { headers: { Cookie: devCookie } })).json();
check('/mine 认领到自己那条', mine1.ids.includes(note.id) && mine1.nickname === '访客甲', JSON.stringify(mine1));
const mineOther = await (await call('/api/guestbook/mine', { headers: { Cookie: otherCookie } })).json();
check('别的设备认领不到', mineOther.ids.length === 0);

check(
  '别人的设备删不掉 → 403',
  (await call(`/api/guestbook/${note.id}`, { method: 'DELETE', headers: { Cookie: otherCookie } })).status === 403
);
check(
  '不带设备号删不掉 → 403',
  (await call(`/api/guestbook/${note.id}`, { method: 'DELETE' })).status === 403
);
check(
  '本人撤回 → 200',
  (await call(`/api/guestbook/${note.id}`, { method: 'DELETE', headers: { Cookie: devCookie } })).status === 200
);
check('撤回后图片一并清掉', store.size === 0);
const mine2 = await (await call('/api/guestbook/mine', { headers: { Cookie: devCookie } })).json();
check('撤回后 /mine 变空', mine2.ids.length === 0 && mine2.nickname === '访客甲');

// 再留一条给管理员删，验证管理员不受归属限制
const fd2 = new FormData();
fd2.append('body', '给管理员删的');
const note2 = await (await call('/api/guestbook', { method: 'POST', body: fd2 })).json();
check('匿名留言不绑设备', !(await (await call('/api/guestbook/mine')).json()).ids.includes(note2.id));

/* ---------- 删除 ---------- */
check('管理员删任意留言', (await A(`/api/guestbook/${note2.id}`, 'DELETE')).status === 200);
check('删档案馆条目', (await A(`/api/archive/${entryId}`, 'DELETE')).status === 200);
check('删文章', (await A(`/api/articles/${artId}`, 'DELETE')).status === 200);
check('文章只剩 seed 那篇', (await (await call('/api/articles')).json()).length === 1);

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
