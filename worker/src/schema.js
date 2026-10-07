/** D1 建表语句。数组形式是为了能用 batch 一次性执行（D1 不接受多语句字符串）。 */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS articles (
     id            INTEGER PRIMARY KEY AUTOINCREMENT,
     slug          TEXT    NOT NULL UNIQUE,
     title         TEXT    NOT NULL,
     author        TEXT    NOT NULL,
     published_at  TEXT    NOT NULL,
     category      TEXT,
     excerpt       TEXT    NOT NULL,
     content       TEXT    NOT NULL,
     sort_order    INTEGER NOT NULL DEFAULT 0,
     created_at    TEXT    NOT NULL,
     locked_at     TEXT            -- 收录（进档案馆）之后置位，正文随即不可再改
   )`,
  `CREATE TABLE IF NOT EXISTS echoes (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
     device_id   TEXT    NOT NULL,
     name        TEXT,
     body        TEXT    NOT NULL,
     created_at  TEXT    NOT NULL,
     UNIQUE (article_id, device_id)
   )`,
  `CREATE TABLE IF NOT EXISTS drafts (
     device_id   TEXT NOT NULL,
     slot        TEXT NOT NULL,
     name        TEXT,
     body        TEXT,
     updated_at  TEXT NOT NULL,
     PRIMARY KEY (device_id, slot)
   )`,
  `CREATE TABLE IF NOT EXISTS archive_entries (
     id          INTEGER PRIMARY KEY AUTOINCREMENT,
     year        INTEGER NOT NULL,
     month       INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
     article_id  INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
     UNIQUE (year, month, article_id)
   )`,
  // 图片本身放 R2，这里只留 key —— D1 不适合塞 5MB 的 BLOB
  `CREATE TABLE IF NOT EXISTS guestbook (
     id           INTEGER PRIMARY KEY AUTOINCREMENT,
     name         TEXT,
     body         TEXT,
     image_key    TEXT,
     image_mime   TEXT,
     image_bytes  INTEGER,
     device_id    TEXT,
     created_at   TEXT    NOT NULL
   )`,
  // 设备即账号：只有一串随机号，不存手机号/邮箱/密码
  `CREATE TABLE IF NOT EXISTS devices (
     id           TEXT PRIMARY KEY,
     nickname     TEXT,
     created_at   TEXT NOT NULL,
     last_seen_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_guestbook_device ON guestbook (device_id)`,
  `CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_archive_year_month ON archive_entries (year, month)`,
  `CREATE INDEX IF NOT EXISTS idx_guestbook_created ON guestbook (created_at DESC)`,
];
