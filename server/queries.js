import { db, tx } from './db.js';
import { uploadToImgbb } from './imgbb.js';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------- 日期 ---------------- */

/** '2026-10-05' → '2026.10.05'（卡片元信息行） */
export const metaDate = (iso) => iso.replaceAll('-', '.');

/** '2026-10-05' → '10.05'（档案馆月份面板里的日期） */
export const monthDay = (iso) => iso.slice(5).replace('-', '.');

/** ISO 时间串 → 'YYYY.MM.DD'，按服务器本地时区（与浏览器端保持一致口径） */
export function displayDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

/* ---------------- 文章 ---------------- */

const ARTICLE_COLS =
  'id, slug, title, author, published_at, category, excerpt, content, sort_order, created_at, locked_at';

function shapeArticle(row) {
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    author: row.author,
    publishedAt: row.published_at,
    category: row.category,
    excerpt: row.excerpt,
    content: row.content,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    /** 模板直接用的两个派生字段 */
    meta: row.category ? `${metaDate(row.published_at)} · ${row.category}` : metaDate(row.published_at),
    monthDay: monthDay(row.published_at),
    lockedAt: row.locked_at ?? null,
  };
}

/**
 * 主动访问窗口：发布后半年内可以直接打开全文。
 * 半年之后这篇"沉入档案馆"，只能等随机翻到它 —— 这是刻意的，
 * 见 index.ejs 里档案馆的定位：过刊不摆在架子的最外面。
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
export function randomArticle() {
  return shapeArticle(db.prepare(`SELECT ${ARTICLE_COLS} FROM articles ORDER BY RANDOM() LIMIT 1`).get());
}

/** 收录 = 锁定：之后正文不再可改 */
export function lockArticle(id) {
  db.prepare('UPDATE articles SET locked_at = ? WHERE id = ? AND locked_at IS NULL').run(new Date().toISOString(), id);
}

export function listArticles() {
  return db
    .prepare(`SELECT ${ARTICLE_COLS} FROM articles ORDER BY sort_order ASC, published_at DESC, id DESC`)
    .all()
    .map(shapeArticle);
}

export function getArticleBySlug(slug) {
  return shapeArticle(db.prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE slug = ?`).get(slug));
}

export function getArticleById(id) {
  return shapeArticle(db.prepare(`SELECT ${ARTICLE_COLS} FROM articles WHERE id = ?`).get(id));
}

export function createArticle(a) {
  const info = db
    .prepare(
      `INSERT INTO articles (slug, title, author, published_at, category, excerpt, content, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(a.slug, a.title, a.author, a.publishedAt, a.category, a.excerpt, a.content, a.sortOrder, new Date().toISOString());
  return getArticleById(Number(info.lastInsertRowid));
}

export function updateArticle(id, a) {
  const info = db
    .prepare(
      `UPDATE articles SET slug = ?, title = ?, author = ?, published_at = ?, category = ?,
              excerpt = ?, content = ?, sort_order = ?
       WHERE id = ?`
    )
    .run(a.slug, a.title, a.author, a.publishedAt, a.category, a.excerpt, a.content, a.sortOrder, id);
  return info.changes ? getArticleById(id) : null;
}

export function deleteArticle(id) {
  // archive_entries 对 articles 是 ON DELETE CASCADE，外键已开启
  return db.prepare('DELETE FROM articles WHERE id = ?').run(id).changes > 0;
}

/* ---------------- 档案馆 ---------------- */

/**
 * 返回 [{year, months:[{month, hasPosts, posts:[…]}], panelPosts:[…], panelMonth:''}]
 * 年份倒序；每个月恒定输出，无条目的月份 hasPosts=false。
 */
export function getArchive() {
  const rows = db
    .prepare(
      `SELECT e.id AS entry_id, e.year, e.month, a.id AS id, a.title, a.slug, a.published_at
       FROM archive_entries e
       JOIN articles a ON a.id = e.article_id
       ORDER BY e.year DESC, e.month ASC, a.published_at ASC, e.id ASC`
    )
    .all();

  const byYear = new Map();
  for (const r of rows) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Map());
    const months = byYear.get(r.year);
    if (!months.has(r.month)) months.set(r.month, []);
    months.get(r.month).push({
      entryId: r.entry_id,
      id: r.id,
      title: r.title,
      date: monthDay(r.published_at),
      // 指向文章永久页。半年之后那页只剩「已入档」视图 —— 这是刻意的，不是坏链
      href: `/p/${encodeURIComponent(r.slug)}`,
    });
  }

  // 合并每日清单（扁平文件）：把每天的文/诗/乐也按年月并进档案馆网格。
  // 清单缺失或损坏不影响首页，只是档案馆里看不到每日。
  try {
    const manPath = join(projectRoot, 'public', 'daily-manifest.json');
    if (existsSync(manPath)) {
      const daily = JSON.parse(readFileSync(manPath, 'utf8'));
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
      // 面板初始内容 = 该年里最新一个有内容的月份（与重构前一致：面板不带 open）
      let panelPosts = [];
      let panelMonth = '';
      for (let m = 12; m >= 1; m -= 1) {
        const posts = months.get(m);
        if (posts && posts.length) {
          panelPosts = posts;
          panelMonth = String(m).padStart(2, '0');
          break;
        }
      }
      return { year, months: list, panelPosts, panelMonth };
    });
}

export function listArchiveEntries() {
  return db
    .prepare(
      `SELECT e.id, e.year, e.month, a.id AS article_id, a.title, a.published_at
       FROM archive_entries e JOIN articles a ON a.id = e.article_id
       ORDER BY e.year DESC, e.month DESC, e.id DESC`
    )
    .all()
    .map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      articleId: r.article_id,
      title: r.title,
      publishedAt: r.published_at,
    }));
}

export function createArchiveEntry({ year, month, articleId }) {
  const info = db
    .prepare('INSERT OR IGNORE INTO archive_entries (year, month, article_id) VALUES (?, ?, ?)')
    .run(year, month, articleId);
  if (!info.changes) return null;
  // 收录即锁定：进档案馆之后这篇的正文不再可改
  lockArticle(articleId);
  return Number(info.lastInsertRowid);
}

export function deleteArchiveEntry(id) {
  return db.prepare('DELETE FROM archive_entries WHERE id = ?').run(id).changes > 0;
}

/* ---------------- 留言板 ---------------- */

/* ---------------- 设备即账号 ---------------- */

export function registerDevice(id) {
  const now = new Date().toISOString();
  db.prepare('INSERT OR IGNORE INTO devices (id, created_at, last_seen_at) VALUES (?, ?, ?)').run(id, now, now);
  return id;
}

export function touchDevice(id, nickname) {
  const now = new Date().toISOString();
  if (nickname) {
    db.prepare('UPDATE devices SET last_seen_at = ?, nickname = ? WHERE id = ?').run(now, nickname, id);
  } else {
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now, id);
  }
}

/** 「我的」：这台设备留过的留言 id + 上次用的名字（没有名字就不预填） */
export function myGuestbook(deviceId) {
  if (!deviceId) return { ids: [], nickname: null };
  const dev = db.prepare('SELECT nickname FROM devices WHERE id = ?').get(deviceId);
  const rows = db.prepare('SELECT id FROM guestbook WHERE device_id = ? ORDER BY id DESC').all(deviceId);
  return { ids: rows.map((r) => r.id), nickname: dev?.nickname || null };
}

export function deviceCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM devices').get().n;
}

const GUEST_COLS = 'id, name, body, image_mime, image_bytes, image_url, created_at, device_id';

function shapeNote(row) {
  return {
    id: row.id,
    name: row.name || '匿名',
    body: row.body || '',
    date: displayDate(row.created_at),
    // 图床托管时直接用外部 URL；否则走本站的图片接口（库里的 BLOB）
    imageUrl: row.image_url || (row.image_mime ? `/api/guestbook/${row.id}/image` : null),
    imageBytes: row.image_bytes ?? 0,
    createdAt: row.created_at,
  };
}

export function listGuestbook({ limit = 50, before = null } = {}) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const sql = before
    ? `SELECT ${GUEST_COLS} FROM guestbook WHERE id < ? ORDER BY id DESC LIMIT ?`
    : `SELECT ${GUEST_COLS} FROM guestbook ORDER BY id DESC LIMIT ?`;
  const stmt = before ? db.prepare(sql).all(Number(before), n) : db.prepare(sql).all(n);
  return stmt.map(shapeNote);
}

export async function insertGuestbook({ name, body, image, deviceId }) {
  // 配了图床就托管到图床、库里只留 URL；没配就退回把图存在本地库里
  let imageUrl = null;
  if (image && process.env.IMGBB_API_KEY) {
    const up = await uploadToImgbb({
      apiKey: process.env.IMGBB_API_KEY,
      data: image.data,
      mime: image.mime,
      filename: name || 'guestbook',
    });
    imageUrl = up.url;
  }

  return tx(() => {
    const info = db
      .prepare(
        `INSERT INTO guestbook (name, body, image, image_mime, image_bytes, image_url, device_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        name,
        body,
        image && !imageUrl ? image.data : null,
        image?.mime ?? null,
        image?.bytes ?? null,
        imageUrl,
        deviceId ?? null,
        new Date().toISOString()
      );
    if (deviceId) touchDevice(deviceId, name);
    const row = db.prepare(`SELECT ${GUEST_COLS} FROM guestbook WHERE id = ?`).get(Number(info.lastInsertRowid));
    return shapeNote(row);
  });
}

/** 谁能删这条：管理员删任意一条，设备主人只能删自己那条 */
export function deleteGuestbookAs(id, { deviceId, isAdmin }) {
  const row = db.prepare('SELECT device_id FROM guestbook WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: 'not-found' };
  if (!isAdmin && (!deviceId || row.device_id !== deviceId)) return { ok: false, reason: 'forbidden' };
  return db.prepare('DELETE FROM guestbook WHERE id = ?').run(id).changes > 0
    ? { ok: true }
    : { ok: false, reason: 'not-found' };
}

export function getGuestbookImage(id) {
  return db.prepare('SELECT image, image_mime FROM guestbook WHERE id = ?').get(id);
}

export function guestbookStats() {
  const row = db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(image_bytes), 0) AS bytes FROM guestbook')
    .get();
  return { count: row.n, imageBytes: row.bytes };
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

export function listEchoes(articleId) {
  return db
    .prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE article_id = ? ORDER BY id ASC`)
    .all(articleId)
    .map(shapeEcho);
}

export function myEcho(articleId, deviceId) {
  if (!deviceId) return null;
  const row = db
    .prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE article_id = ? AND device_id = ?`)
    .get(articleId, deviceId);
  return row ? shapeEcho(row) : null;
}

export function createEcho(articleId, deviceId, { name, body }) {
  const info = db
    .prepare('INSERT INTO echoes (article_id, device_id, name, body, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(articleId, deviceId, name, body, new Date().toISOString());
  return shapeEcho(db.prepare(`SELECT ${ECHO_COLS} FROM echoes WHERE id = ?`).get(Number(info.lastInsertRowid)));
}

/** 本人撤回自己的那条；管理员撤任意一条 */
export function deleteEchoAs(id, { deviceId, isAdmin }) {
  const row = db.prepare('SELECT device_id FROM echoes WHERE id = ?').get(id);
  if (!row) return { ok: false, reason: 'not-found' };
  if (!isAdmin && (!deviceId || row.device_id !== deviceId)) return { ok: false, reason: 'forbidden' };
  return db.prepare('DELETE FROM echoes WHERE id = ?').run(id).changes > 0
    ? { ok: true }
    : { ok: false, reason: 'not-found' };
}

/* ---------------- 草稿：写到一半 ---------------- */

export function getDraft(deviceId, slot) {
  if (!deviceId) return null;
  const row = db
    .prepare('SELECT name, body, updated_at FROM drafts WHERE device_id = ? AND slot = ?')
    .get(deviceId, slot);
  return row ? { name: row.name || '', body: row.body || '', updatedAt: row.updated_at } : null;
}

export function putDraft(deviceId, { slot, name, body }) {
  if (!deviceId) return null;
  db.prepare(
    `INSERT INTO drafts (device_id, slot, name, body, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (device_id, slot) DO UPDATE SET name = ?, body = ?, updated_at = ?`
  ).run(deviceId, slot, name, body, new Date().toISOString(), name, body, new Date().toISOString());
  return getDraft(deviceId, slot);
}

export function clearDraft(deviceId, slot) {
  if (!deviceId) return;
  db.prepare('DELETE FROM drafts WHERE device_id = ? AND slot = ?').run(deviceId, slot);
}

/* ---------------- 本日 Daily：首页「每日」右栏的内容 ---------------- */

/** 今天（服务器本地时区，与页面其它日期同一口径） */
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

export const getDailyByDate = (date) =>
  shapeDaily(db.prepare(`SELECT ${DAILY_COLS} FROM daily_entries WHERE slot_date = ?`).get(date));

/** 按日期写入：同一天再提交就是更新（slot_date 唯一） */
export function upsertDaily({ date, category, title, body }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO daily_entries (slot_date, category, title, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (slot_date) DO UPDATE SET category = ?, title = ?, body = ?, updated_at = ?`
  ).run(date, category, title, body, now, now, category, title, body, now);
  return getDailyByDate(date);
}
