import { renderHome, renderArticle, renderAdmin } from './html.js';
import {
  Invalid,
  Conflict,
  validateGuestbook,
  validateArticle,
  validateArchiveEntry,
  validateEcho,
  validateDraft,
  IMAGE_MIME,
  errorStatus,
} from '../../server/validators.js';
import { isAdmin, verifyPassword, cookieHeader, clearedCookieHeader, ensureDevice } from './auth.js';
import * as db from './db.js';

const DEFAULT_MAIL = 'afterrainnn@outlook.com';
const MAX_IMAGE_BYTES = (env) => Number(env.MAX_IMAGE_BYTES) || 5 * 1024 * 1024;

/* ---------------- 响应小工具 ---------------- */

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

const page = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const redirect = (location, headers = {}) =>
  new Response(null, { status: 303, headers: { Location: location, ...headers } });

/* ---------------- 极简路由 ---------------- */

const routes = [];
const on = (method, pattern, handler) => routes.push({ method, pattern, handler });

function match(pattern, path) {
  const p = pattern.split('/');
  const s = path.split('/');
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

/** GET /healthz —— 给外部探活用：连一次库，库挂了就 500 */
on('GET', '/healthz', async (req, env) => {
  try {
    await db.bootstrap(env);
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM articles').first();
    return json({ ok: true, articles: row?.n ?? 0 }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return json({ ok: false, error: '数据库不可用' }, 503, { 'Cache-Control': 'no-store' });
  }
});

/* ---------------- 页面 ---------------- */

on('GET', '/', async (req, env) => {
  await db.bootstrap(env);
  const limit = Number(env.GUESTBOOK_SSR_LIMIT) || 50;
  return page(
    renderHome({
      articles: await db.listArticles(env),
      archive: await db.getArchive(env),
      notes: await db.listGuestbook(env, { limit }),
      submitMail: env.SUBMIT_MAIL || DEFAULT_MAIL,
    })
  );
});

/**
 * GET /p/:slug —— 文章永久页。
 * 发布后半年内可以直接打开全文；半年之后沉入档案馆，只剩「已入档」视图，
 * 正文要等随机翻到它（?r=1）才展开。
 */
on('GET', '/p/:slug', async (req, env, params) => {
  await db.bootstrap(env);
  const article = await db.getArticleBySlug(env, params.slug);
  if (!article) return new Response('404 没有这篇', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const archived = db.isArchived(article);
  const viaRandom = new URL(req.url).searchParams.get('r') === '1';
  return page(
    renderArticle({
      article,
      archived,
      // 随机是唯一能翻到旧文的门，不受半年窗口限制
      readable: !archived || viaRandom,
      echoes: await db.listEchoes(env, article.id),
    })
  );
});

/** GET /random —— 随便一篇。不分时间，任何一年的都可能被翻出来 */
on('GET', '/random', async (req, env) => {
  await db.bootstrap(env);
  const article = await db.randomArticle(env);
  if (!article) return redirect('/');
  return redirect(`/p/${encodeURIComponent(article.slug)}?r=1`);
});

on('GET', '/admin', async (req, env) => {
  await db.bootstrap(env);
  const adminPath = '/admin';
  const authed = await isAdmin(env, req);
  return page(
    renderAdmin({
      authed,
      loginError: new URL(req.url).searchParams.get('e') === '1',
      adminPath,
      articles: authed ? await db.listArticles(env) : [],
      archiveEntries: authed ? await db.listArchiveEntries(env) : [],
      notes: authed ? await db.listGuestbook(env, { limit: 200 }) : [],
      stats: authed ? await db.guestbookStats(env) : null,
    })
  );
});

on('POST', '/admin/login', async (req, env) => {
  const ct = req.headers.get('content-type') || '';
  const body = ct.includes('application/json')
    ? await req.json().catch(() => ({}))
    : Object.fromEntries(await req.formData());
  const secure = new URL(req.url).protocol === 'https:';

  if (!(await verifyPassword(env, body.password))) {
    if (ct.includes('application/json')) return json({ error: '口令不正确' }, 401);
    return redirect('/admin?e=1');
  }
  const cookie = await cookieHeader(env, { secure });
  if (ct.includes('application/json')) return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  return redirect('/admin', { 'Set-Cookie': cookie });
});

on('POST', '/admin/logout', async (req, env) => {
  const ct = req.headers.get('content-type') || '';
  const headers = { 'Set-Cookie': clearedCookieHeader({ secure: new URL(req.url).protocol === 'https:' }) };
  if (ct.includes('application/json')) return json({ ok: true }, 200, headers);
  return redirect('/admin', headers);
});

/* ---------------- 公开接口 ---------------- */

on('GET', '/api/articles', async (req, env) => {
  await db.bootstrap(env);
  return json(await db.listArticles(env));
});

on('GET', '/api/articles/:slug', async (req, env, params) => {
  await db.bootstrap(env);
  const a = await db.getArticleBySlug(env, params.slug);
  return a ? json(a) : json({ error: 'not found' }, 404);
});

on('GET', '/api/archive', async (req, env) => {
  await db.bootstrap(env);
  return json(await db.getArchive(env));
});

on('GET', '/api/guestbook', async (req, env) => {
  await db.bootstrap(env);
  const url = new URL(req.url);
  const before = url.searchParams.get('before');
  return json({ items: await db.listGuestbook(env, { limit: url.searchParams.get('limit'), before }) });
});

on('GET', '/api/guestbook/mine', async (req, env, params, ctx) => {
  await db.bootstrap(env);
  // 单独一个接口、不走 SSR：让首页与设备无关（可缓存、不串号）
  return json(await db.myGuestbook(env, ctx.deviceId), 200, { 'Cache-Control': 'no-store' });
});

on('POST', '/api/guestbook', async (req, env, params, ctx) => {
  await db.bootstrap(env);
  const ct = req.headers.get('content-type') || '';
  if (!ct.includes('multipart/form-data')) {
    return json({ error: '请以 multipart/form-data 提交', field: 'image' }, 400);
  }
  const form = await req.formData();
  const file = form.get('image');
  let image = null;
  if (file && typeof file === 'object' && file.size) {
    // 字段名沿用 multer 那份（mimetype / size / buffer），validator 是两边共用的
    image = {
      mimetype: file.type,
      size: file.size,
      buffer: new Uint8Array(await file.arrayBuffer()),
    };
  }
  const data = validateGuestbook({
    name: form.get('name'),
    body: form.get('body'),
    image,
    maxImageBytes: MAX_IMAGE_BYTES(env),
  });
  return json(await db.insertGuestbook(env, { ...data, deviceId: ctx.deviceId }), 201);
});

on('GET', '/api/guestbook/:id/image', async (req, env, params) => {
  const row = await db.getGuestbookRow(env, params.id);
  if (!row?.image_key) return new Response('not found', { status: 404 });
  const obj = await env.IMAGES.get(row.image_key);
  if (!obj) return new Response('not found', { status: 404 });

  const mime = (IMAGE_MIME.has(row.image_mime) && row.image_mime) || 'application/octet-stream';
  const etag = `W/"gb-${params.id}"`;
  if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
    },
  });
});

/* ---------------- 管理接口 ---------------- */

const guard = async (env, req) => {
  if (await isAdmin(env, req)) return null;
  return json({ error: 'unauthorized' }, 401);
};

on('POST', '/api/articles', async (req, env) => {
  const denied = await guard(env, req);
  if (denied) return denied;
  const data = validateArticle(await req.json());
  if (await db.getArticleBySlug(env, data.slug)) throw new Invalid('slug 已存在', 'slug');
  return json(await db.createArticle(env, data), 201);
});

on('PUT', '/api/articles/:id', async (req, env, params) => {
  const denied = await guard(env, req);
  if (denied) return denied;
  const id = Number(params.id);
  const current = await db.getArticleById(env, id);
  if (!current) return json({ error: 'not found' }, 404);
  // 收录后不改：进了档案馆就定稿，要改就另发一篇
  if (current.lockedAt) throw new Conflict('这篇已经收录，不能再改。要改就另发一篇。', 'content');
  const data = validateArticle(await req.json());
  const dup = await db.getArticleBySlug(env, data.slug);
  if (dup && dup.id !== id) throw new Invalid('slug 已存在', 'slug');
  return json(await db.updateArticle(env, id, data));
});

on('DELETE', '/api/articles/:id', async (req, env, params) => {
  const denied = await guard(env, req);
  if (denied) return denied;
  const ok = await db.deleteArticle(env, Number(params.id));
  return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
});

on('POST', '/api/archive', async (req, env) => {
  const denied = await guard(env, req);
  if (denied) return denied;
  const data = validateArchiveEntry(await req.json());
  if (!(await db.getArticleById(env, data.articleId))) throw new Invalid('文章不存在', 'articleId');
  const id = await db.createArchiveEntry(env, data);
  if (!id) throw new Invalid('该月份里已经有这篇文章了', 'articleId');
  return json({ id, ...data }, 201);
});

on('DELETE', '/api/archive/:id', async (req, env, params) => {
  const denied = await guard(env, req);
  if (denied) return denied;
  const ok = await db.deleteArchiveEntry(env, Number(params.id));
  return ok ? json({ ok: true }) : json({ error: 'not found' }, 404);
});

on('DELETE', '/api/guestbook/:id', async (req, env, params, ctx) => {
  const result = await db.deleteGuestbookAs(env, Number(params.id), {
    deviceId: ctx.deviceId,
    isAdmin: await isAdmin(env, req),
  });
  if (result.ok) return json({ ok: true });
  if (result.reason === 'forbidden') return json({ error: '这条不是你留的' }, 403);
  return json({ error: 'not found' }, 404);
});

/* ---------------- 回声与草稿 ---------------- */

/** GET /api/echoes?article=:id —— 按时间正序。不给条数、不排序、不分页 */
on('GET', '/api/echoes', async (req, env, params, ctx) => {
  await db.bootstrap(env);
  return json({ items: await db.listEchoes(env, Number(new URL(req.url).searchParams.get('article'))) }, 200, {
    'Cache-Control': 'no-store',
  });
});

/** GET /api/echoes/mine?article=:id —— 这篇我留过吗（一台设备一篇一次） */
on('GET', '/api/echoes/mine', async (req, env, params, ctx) => {
  const articleId = Number(new URL(req.url).searchParams.get('article'));
  return json({ echo: await db.myEcho(env, articleId, ctx.deviceId) }, 200, { 'Cache-Control': 'no-store' });
});

/** POST /api/echoes —— 一篇一次；留过了就 409，先撤回才能重留 */
on('POST', '/api/echoes', async (req, env, params, ctx) => {
  const body = await req.json();
  const articleId = Number(body.articleId);
  if (!(await db.getArticleById(env, articleId))) return json({ error: '文章不存在' }, 404);
  if (!ctx.deviceId) return json({ error: '这台设备还没有身份' }, 403);
  if (await db.myEcho(env, articleId, ctx.deviceId)) {
    throw new Conflict('这篇你已经留过回声了，先撤回才能重留', 'body');
  }
  return json(await db.createEcho(env, articleId, ctx.deviceId, validateEcho(body)), 201);
});

/** DELETE /api/echoes/:id —— 本人撤回；管理员撤任意一条 */
on('DELETE', '/api/echoes/:id', async (req, env, params, ctx) => {
  const result = await db.deleteEchoAs(env, Number(params.id), {
    deviceId: ctx.deviceId,
    isAdmin: await isAdmin(env, req),
  });
  if (result.ok) return json({ ok: true });
  if (result.reason === 'forbidden') return json({ error: '这条不是你留的' }, 403);
  return json({ error: 'not found' }, 404);
});

/** GET /api/drafts?slot=guestbook|echo:<id> —— 写到一半 */
on('GET', '/api/drafts', async (req, env, params, ctx) => {
  const slot = new URL(req.url).searchParams.get('slot') || 'guestbook';
  return json({ draft: await db.getDraft(env, ctx.deviceId, slot) }, 200, { 'Cache-Control': 'no-store' });
});

on('PUT', '/api/drafts', async (req, env, params, ctx) => {
  if (!ctx.deviceId) return json({ error: '这台设备还没有身份' }, 403);
  return json({ draft: await db.putDraft(env, ctx.deviceId, validateDraft(await req.json())) });
});

on('DELETE', '/api/drafts', async (req, env, params, ctx) => {
  await db.clearDraft(env, ctx.deviceId, new URL(req.url).searchParams.get('slot') || 'guestbook');
  return json({ ok: true });
});

/* ---------------- 入口 ---------------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 建表与首启 seed 先跑完，设备登记才有表可写
    await db.bootstrap(env);

    // 设备即账号：动静态都先确认身份，新设备登记一次
    const dev = await ensureDevice(env, request);
    if (dev.setCookie) await db.registerDevice(env, dev.id);
    const withCookie = (res) => {
      if (!dev.setCookie) return res;
      const headers = new Headers(res.headers);
      headers.append('Set-Cookie', dev.setCookie);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    };

    for (const r of routes) {
      if (r.method !== request.method) continue;
      const params = match(r.pattern, path);
      if (!params) continue;
      try {
        return withCookie(await r.handler(request, env, params, { deviceId: dev.id }));
      } catch (err) {
        const status = err instanceof Invalid ? 400 : errorStatus(err);
        if (status >= 500) console.error('[error]', request.method, path, err);
        return withCookie(
          json({ error: status >= 500 ? '服务器内部错误' : err.message, field: err.field ?? null }, status)
        );
      }
    }

    // 其余交给静态资源（css / js / img / fonts）；取不到再 404
    const asset = await env.ASSETS.fetch(request);
    if (asset && asset.status !== 404) return asset;
    return new Response('404 页面不存在', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
