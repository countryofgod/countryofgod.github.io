import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedIfEmpty } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(here, '..');

const dbFile = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : join(projectRoot, 'data', 'gods-country.db');
mkdirSync(dirname(dbFile), { recursive: true });

export const dbPath = dbFile;

export const db = new DatabaseSync(dbFile);

// WAL：读写不互相阻塞，适合"偶尔写、持续读"的站点
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA synchronous = NORMAL');
// 档案馆条目对文章是 ON DELETE CASCADE，必须显式打开外键约束才生效
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS articles (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  slug          TEXT    NOT NULL UNIQUE,
  title         TEXT    NOT NULL,
  author        TEXT    NOT NULL,
  published_at  TEXT    NOT NULL,
  category      TEXT,
  excerpt       TEXT    NOT NULL,
  content       TEXT    NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS archive_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  UNIQUE (year, month, article_id)
);

CREATE TABLE IF NOT EXISTS guestbook (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT,
  body         TEXT,
  image        BLOB,
  image_mime   TEXT,
  image_bytes  INTEGER,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_year_month ON archive_entries (year, month);
CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook (created_at DESC);
`);

// 设备即账号：不存手机号/邮箱/密码，只有一串随机号
db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  nickname     TEXT,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);
`);

// 老库升级：guestbook 补一列归属设备
const guestCols = db.prepare('PRAGMA table_info(guestbook)').all().map((c) => c.name);
if (!guestCols.includes('device_id')) {
  db.exec('ALTER TABLE guestbook ADD COLUMN device_id TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_guestbook_device ON guestbook (device_id)');
}

// 收录（进档案馆）之后正文不再可改：这一列非空即为锁定
const articleCols = db.prepare('PRAGMA table_info(articles)').all().map((c) => c.name);
if (!articleCols.includes('locked_at')) {
  db.exec('ALTER TABLE articles ADD COLUMN locked_at TEXT');
}

db.exec(`
CREATE TABLE IF NOT EXISTS echoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  device_id   TEXT    NOT NULL,
  name        TEXT,
  body        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  UNIQUE (article_id, device_id)
);

CREATE TABLE IF NOT EXISTS drafts (
  device_id   TEXT NOT NULL,
  slot        TEXT NOT NULL,
  name        TEXT,
  body        TEXT,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (device_id, slot)
);
`);

export const seeded = seedIfEmpty(db);

/** 事务包装：任一步抛错整体回滚 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
