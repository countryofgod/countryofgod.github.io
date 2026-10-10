import { SCHEMA } from './schema.js';
import { seedArticle, seedArchive, seedDaily } from '../../server/seed-data.js';
import { Unavailable } from '../../server/validators.js';
import { uploadToImgbb } from '../../server/imgbb.js';

/* ---------------- 日期 ---------------- */

export const metaDate = (iso) => String(iso).replaceAll('-', '.');
export const monthDay = (iso) => String(iso).slice(5).replace('-', '.');

export function displayDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ---------------- 建表 + 首次 seed ---------------- */

let bootstrapped = null;

/** 每个 isolate 只跑一次：建表，articles 为空时导入《创刊号》 */
export function bootstrap(env) {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
      // 老库升级：guestbook 补一列归属设备
      const cols = (await env.DB.prepare('PRAGMA table_info(guestbook)').all()).results.map((c) => c.name);
      if (!cols.includes('device_id')) {
        await env.DB.prepare('ALTER TABLE guestbook ADD COLUMN device_id TEXT').run();
        await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_guestbook_device ON guestbook (device_id)').run();
      }
      if (!cols.includes('image_url')) {
        await env.DB.prepare('ALTER TABLE guestbook ADD COLUMN image_url TEXT').run();
      }
      const articleCols = (await env.DB.prepare('PRAGMA table_info(articles)').all()).results.map((c) => c.name);
      if (!articleCols.includes('locked_at')) {
        await env.DB.prepare('ALTER TABLE articles ADD COLUMN locked_at TEXT').run();
      }
      const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM articles').first();
      if (!row || row.n === 0) {
        const info = await env.DB.prepare(
          `INSERT INTO articles (slug, title, author, published_at, category, excerpt, content, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            seedArticle.slug,
            seedArticle.title,
            seedArticle.author,
            seedArticle.publishedAt,
            seedArticle.category,
            seedArticle.excerpt,
            seedArticle.content,
            seedArticle.sortOrder,
            new Date().toISOString()
          )
          .run();
        await env.DB.prepare('INSERT INTO archive_entries (year, month, article_id) VALUES (?, ?, ?)')
          .bind(seedArchive.year, seedArchive.month, Number(info.meta.last_row_id))
          .run();
        // seed 出来的这篇已经在档案馆里，按"收录后不改"同样锁定
        await lockArticle(env, Number(info.meta.last_row_id));
      }
      // 「本日 Daily」：表里还一条都没有时种一条今天的占位（只有标题，正文等 admin 填）
      const dailyRow = await env.DB.prepare('SELECT COUNT(*) AS n FROM daily_entries').first();
      if (!dailyRow || dailyRow.n === 0) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
        const iso = now.toISOString();
        await env.DB.prepare(
          `INSERT INTO daily_entries (slot_date, category, title, body, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(today, seedDaily.category, seedDaily.title, seedDaily.body, iso, iso)
          .run();
      }
    })();
  }
  return bootstrapped;
}

/* ---------------- 文章 ---------------- */

const ARTICLE_COLS =
  'id, slug, title, author, published_at, category, excerpt, content, sort_order, created_at, locked_at';

const shapeArticle = (r) =>
  r && {
    id: r.id,
    slug: r.slug,
    title: r.title,
    author: r.author,
    publishedAt: r.published_at,
    category: r.category,
    excerpt: r.excerpt,
    content: r.content,
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    meta: r.category ? `${metaDate(r.published_at)} · ${r.category}` : metaDate(r.published_at),
    monthDay: monthDay(r.published_at),
    lockedAt: r.locked_at ?? null,
  };

const one = async (stmt) => shapeArticle(await stmt.first());

/**
 * 主动访问窗口：发布后半年内可以直接打开全文。
 * 半年之后这篇沉入档案馆，只能等随机翻到它 —— 刻意的，不是坏链。
 */
export const ACCESS_WINDOW_MONTHS = 6;

export function isArchived(article) {
  if (!article?.publishedAt) return false;
  const d = new Date(`${article.publishedAt}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  d.setUTCMonth(d.getUTCMonth() + ACCESS_WINDOW_MONTHS);
  return Date.now() > d.getTime();
}

/** 随机一篇：不分时间，任何一年的都可能被翻出来 */
export const randomArticle = (env) =>
  one(env.DB.prepare(`SELECT ${ARTICLE_COLS} FROM articles ORDER BY RANDOM() LIMIT 1`));

/** 收录 = 锁定：之后正文不再可改 */
export function lockArticle(env, id) {
  return env.DB.prepare('UPDATE articles SET locked_at = ? WHERE id = ? AND locked_at IS NULL')
    .bind(new Date().toISOString(), id)
    .run();
}

export async function listArticles(env) {
  const { results } = await env.DB.prepare(
    `SELECT ${ARTICLE_COLS} FROM articles ORDER BY sort_order ASC, published_at DESC, id DESC`
  ).all();
  return results.map(shapeArticle);
}

export const getArticleBySlug = (env, slug) =>
  one(env.DB.prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE slug = ?`).bind(slug));

export const getArticleById = (env, id) =>
  one(env.DB.prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE id = ?`).bind(id));

export function createArticle(env, a) {
  return env.DB.prepare(
    `INSERT INTO articles (slug, title, author, published_at, category, excerpt, content, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(a.slug, a.title, a.author, a.publishedAt, a.category, a.excerpt, a.content, a.sortOrder, new Date().toISOString())
    .run()
    .then((info) => getArticleById(env, Number(info.meta.last_row_id)));
}

export async function updateArticle(env, id, a) {
  const info = await env.DB.prepare(
    `UPDATE articles SET slug = ?, title = ?, author = ?, published_at = ?, category = ?,
            excerpt = ?, content = ?, sort_order = ?
     WHERE id = ?`
  )
    .bind(a.slug, a.title, a.author, a.publishedAt, a.category, a.excerpt, a.content, a.sortOrder, id)
    .run();
  return info.meta.changes ? getArticleById(env, id) : null;
}

export async function deleteArticle(env, id) {
  // archive_entries 对 articles 是 ON DELETE CASCADE，D1 默认开启外键；
  // 这里再显式清一遍，避免任何一处外键设置被改动后留下孤儿条目
  await env.DB.prepare('DELETE FROM archive_entries WHERE article_id = ?').bind(id).run();
  const info = await env.DB.prepare('DELETE FROM articles WHERE id = ?').bind(id).run();
  return info.meta.changes > 0;
}

/* ---------------- 档案馆 ---------------- */

export async function getArchive(env) {
  const { results } = await env.DB.prepare(
    `SELECT e.id AS entry_id, e.year, e.month, a.id AS id, a.title, a.slug, a.published_at
     FROM archive_entries e
     JOIN articles a ON a.id = e.article_id
     ORDER BY e.year DESC, e.month ASC, a.published_at ASC, e.id ASC`
  ).all();

  const byYear = new Map();
  for (const r of results) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    const months = byYear.get(r.year);
    if (!months.has(r.month)) months.set(r.month, []);
    months.get(r.month).push({
      entryId: r.entry_id,
      id: r.id,
      title: r.title,
      date: monthDay(r.published_at),
      // 指向文章永久页。半年之后那页只剩「已入档」视图 —— 刻意的，不是坏链
      href: `/p/${encodeURIComponent(r.slug)}`,
    });
  }

  // 合并每日清单（扁平文件，public/daily-manifest.json）：把每天的文/诗/乐也按年月并进网格。
  // Worker 无文件系统，靠 ASSETS 绑定读静态资源；读不到就只显示文章。
  try {
    if (env.ASSETS) {
      const manRes = await env.ASSETS.fetch(new Request('https://assets.local/daily-manifest.json'));
      if (manRes && manRes.ok) {
        const daily = await manRes.json();
        for (const d of daily) {
          if (!byYear.has(d.year)) byYear.set(d.year, new Map());
          const months = byYear.get(d.year);
          if (!months.has(d.month)) months.set(d.month, []);
          months.get(d.month).push({
            title: d.title,
            date: d.date.slice(5).replace('-', '.'),
            href: d.href,
          });
        }
      }
    }
  } catch {
    /* 清单不可用：仅展示文章 */
  }

  return [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, months]) => {
      const list = [];
      for (let m = 1; m <= 12; m += 1) {
        const posts = months.get(m) ?? [];
        list.push({ month: m, hasPosts: posts.length > 0, posts });
      }
      let panelPosts = [];
      for (let m = 12; m >= 1; m -= 1) {
        const posts = months.get(m);
        if (posts && posts.length) {
          panelPosts = posts;
          break;
        }
      }
      return { year, months: list, panelPosts };
    });
}

export async function listArchiveEntries(env) {
  const { results } = await env.DB.prepare(
    `SELECT e.id, e.year, e.month, a.id AS article_id, a.title, a.published_at
     FROM archive_entries e JOIN articles a ON a.id = e.article_id
     ORDER BY e.year DESC, e.month DESC, e.id DESC`
  ).all();
  return results.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    articleId: r.article_id,
    title: r.title,
    publishedAt: r.published_at,
  }));
}

export async function createArchiveEntry(env, { year, month, articleId }) {
  const info = await env.DB.prepare(
    'INSERT OR IGNORE INTO archive_entries (year, month, article_id) VALUES (?, ?, ?)'
  )
    .bind(year, month, articleId)
    .run();
  if (!info.meta.changes) return null;
  // 收录即锁定：进档案馆之后这篇的正文不再可改
  await lockArticle(env, articleId);
  return Number(info.meta.last_row_id);
}

export async function deleteArchiveEntry(env, id) {
  const info = await env.DB.prepare('DELETE FROM archive_entries WHERE id = ?').bind(id).run();
  return info.meta.changes > 0;
}

/* ---------------- 留言板 ---------------- */

const GUEST_COLS = 'id, name, body, image_key, image_url, image_mime, image_bytes, created_at';

const shapeNote = (r) => ({
  id: r.id,
  name: r.name || '匿名',
  body: r.body || '',
  date: displayDate(r.created_at),
  // R2 里的走本站接口；托管在图床上的直接用外部 URL
  imageUrl: r.image_key ? `/api/guestbook/${r.id}/image` : r.image_url || null,
  imageBytes: r.image_bytes ?? 0,
  createdAt: r.created_at,
});

export async function listGuestbook(env, { limit = 50, before = null } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const stmt = before
    ? env.DB.prepare(`SELECT ${GUEST_COLS} FROM guestbook WHERE id < ? ORDER BY id DESC LIMIT ?`).bind(Number(before), n)
    : env.DB.prepare(`SELECT ${GUEST_COLS} FROM guestbook ORDER BY id DESC LIMIT ?`).bind(n);
  const { results } = await stmt.all();
  return results.map(shapeNote);
}

/**
 * 留言入库。图片有三种去处，按优先级：
 *   1. R2（有 IMAGES 绑定）—— 图在自己手里，首选
 *   2. ImgBB（有 IMGBB_API_KEY）—— 图床托管，库里只留 URL
 *   3. 都没有 —— 只能拒掉，且整条留言回滚，不留"说了有图却看不到图"的坏数据
 */
export async function insertGuestbook(env, { name, body, image, deviceId }) {
  const info = await env.DB.prepare(
    `INSERT INTO guestbook (name, body, image_key, image_url, image_mime, image_bytes, device_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(name, body, null, null, null, null, deviceId ?? null, new Date().toISOString())
    .run();
  const id = Number(info.meta.last_row_id);
  if (deviceId) await touchDevice(env, deviceId, name);

  if (image) {
    try {
      if (env.IMAGES) {
        const key = `guestbook/${id}`;
        await env.IMAGES.put(key, image.data, { httpMetadata: { contentType: image.mime } });
        await env.DB.prepare('UPDATE guestbook SET image_key = ?, image_mime = ?, image_bytes = ? WHERE id = ?')
          .bind(key, image.mime, image.bytes, id)
          .run();
      } else if (env.IMGBB_API_KEY) {
        // image 是 validateGuestbook 的返回值：{ data, mime, bytes }
        const up = await uploadToImgbb({
          apiKey: env.IMGBB_API_KEY,
          data: image.data,
          mime: image.mime,
          filename: name || `guestbook-${id}`,
        });
        await env.DB.prepare('UPDATE guestbook SET image_url = ?, image_mime = ?, image_bytes = ? WHERE id = ?')
          .bind(up.url, image.mime, image.bytes, id)
          .run();
      } else {
        throw new Unavailable('图片暂时存不下来，先只留文字吧', 'image');
      }
    } catch (err) {
      await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
      if (err instanceof Unavailable) throw err;
      throw new Unavailable('图片暂时存不下来，先只留文字吧', 'image');
    }
  }

  const row = await env.DB.prepare(`SELECT ${GUEST_COLS} FROM guestbook WHERE id = ?`).bind(id).first();
  return shapeNote(row);
}

export const getGuestbookRow = (env, id) =>
  env.DB.prepare('SELECT image_key, image_mime FROM guestbook WHERE id = ?').bind(id).first();

/** 谁能删这条：管理员删任意一条，设备主人只能撤回自己那条 */
export async function deleteGuestbookAs(env, id, { deviceId, isAdmin }) {
  const row = await env.DB.prepare('SELECT device_id, image_key FROM guestbook WHERE id = ?').bind(id).first();
  if (!row) return { ok: false, reason: 'not-found' };
  if (!isAdmin && (!deviceId || row.device_id !== deviceId)) return { ok: false, reason: 'forbidden' };
  if (row.image_key && env.IMAGES) await env.IMAGES.delete(row.image_key);
  const info = await env.DB.prepare('DELETE FROM guestbook WHERE id = ?').bind(id).run();
  return info.meta.changes > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
}

/* ---------------- 设备即账号 ---------------- */

export async function registerDevice(env, id) {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT OR IGNORE INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?)')
    .bind(id, now, now)
    .run();
  return id;
}

export async function touchDevice(env, id, nickname) {
  const now = new Date().toISOString();
  await (nickname
    ? env.DB.prepare('UPDATE devices SET last_seen_at = ?, nickname = ? WHERE id = ?').bind(now, nickname, id)
    : env.DB.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').bind(now, id)
  ).run();
}

/* ---------------- 回声：一台设备对一篇只留一次 ---------------- */

const ECHO_COLS = 'id, article_id, device_id, name, body, created_at';

const shapeEcho = (r) => ({
  id: r.id,
  articleId: r.article_id,
  name: r.name || '匿名',
  body: r.body,
  date: displayDate(r.created_at),
  createdAt: r.created_at,
});

export async function listEchoes(env, articleId) {
  const { results } = await env.DB.prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE article_id = ? ORDER BY id ASC`)
    .bind(articleId)
    .all();
  return results.map(shapeEcho);
}

export async function myEcho(env, articleId, deviceId) {
  if (!deviceId) return null;
  const row = await env.DB.prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE article_id = ? AND device_id = ?`)
    .bind(articleId, deviceId)
    .first();
  return row ? shapeEcho(row) : null;
}

export async function createEcho(env, articleId, deviceId, { name, body }) {
  const info = await env.DB.prepare(
    'INSERT INTO echoes (article_id, device_id, name, body, created_at) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(articleId, deviceId, name, body, new Date().toISOString())
    .run();
  const row = await env.DB.prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE id = ?`)
    .bind(Number(info.meta.last_row_id))
    .first();
  return shapeEcho(row);
}

/** 本人撤回自己的那条；管理员撤任意一条 */
export async function deleteEchoAs(env, id, { deviceId, isAdmin }) {
  const row = await env.DB.prepare('SELECT device_id FROM echoes WHERE id = ?').bind(id).first();
  if (!row) return { ok: false, reason: 'not-found' };
  if (!isAdmin && (!deviceId || row.device_id !== deviceId)) return { ok: false, reason: 'forbidden' };
  const info = await env.DB.prepare('DELETE FROM echoes WHERE id = ?').bind(id).run();
  return info.meta.changes > 0 ? { ok: true } : { ok: false, reason: 'not-found' };
}

/* ---------------- 草稿：写到一半 ---------------- */

export async function getDraft(env, deviceId, slot) {
  if (!deviceId) return null;
  const row = await env.DB.prepare('SELECT name, body, updated_at FROM drafts WHERE device_id = ? AND slot = ?')
    .bind(deviceId, slot)
    .first();
  return row ? { name: row.name || '', body: row.body || '', updatedAt: row.updated_at } : null;
}

export async function putDraft(env, deviceId, { slot, name, body }) {
  if (!deviceId) return null;
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO drafts (device_id, slot, name, body, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (device_id, slot) DO UPDATE SET name = ?, body = ?, updated_at = ?`
  )
    .bind(deviceId, slot, name, body, now, name, body, now)
    .run();
  return getDraft(env, deviceId, slot);
}

export async function clearDraft(env, deviceId, slot) {
  if (!deviceId) return;
  await env.DB.prepare('DELETE FROM drafts WHERE device_id = ? AND slot = ?').bind(deviceId, slot).run();
}

export async function myGuestbook(env, deviceId) {
  if (!deviceId) return { ids: [], nickname: null };
  const dev = await env.DB.prepare('SELECT nickname FROM devices WHERE id = ?').bind(deviceId).first();
  const { results } = await env.DB.prepare('SELECT id FROM guestbook WHERE device_id = ? ORDER BY id DESC')
    .bind(deviceId)
    .all();
  return { ids: results.map((r) => r.id), nickname: dev?.nickname || null };
}

export async function guestbookStats(env) {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(image_bytes), 0) AS bytes FROM guestbook').first();
  return { count: row?.n ?? 0, imageBytes: row?.bytes ?? 0 };
}

/* ---------------- 本日 Daily：首页「每日」右栏的内容 ---------------- */

/** 今天（与页面其它日期同一口径：服务器本地时区） */
export const todayIso = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const DAILY_COLS = 'id, slot_date, category, title, body, created_at, updated_at';

const shapeDaily = (r) =>
  r && {
    id: r.id,
    date: r.slot_date,
    category: r.category,
    title: r.title,
    body: r.body || '',
    updatedAt: r.updated_at,
  };

export async function getDailyByDate(env, date) {
  const row = await env.DB.prepare(`SELECT ${DAILY_COLS} FROM daily_entries WHERE slot_date = ?`)
    .bind(date)
    .first();
  return shapeDaily(row);
}

/** 按日期写入：同一天再提交就是更新（slot_date 唯一） */
export async function upsertDaily(env, { date, category, title, body }) {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO daily_entries (slot_date, category, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (slot_date) DO UPDATE SET category = ?, title = ?, body = ?, updated_at = ?`
  )
    .bind(date, category, title, body, now, now, category, title, body, now)
    .run();
  return getDailyByDate(env, date);
}
