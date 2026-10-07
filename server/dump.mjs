/**
 * 把 Node 版的 SQLite 导成一份 D1 能直接导入的 .sql。
 *
 *   node server/dump.mjs [输出文件]      # 默认 data/dump-<日期>.sql
 *   npx wrangler d1 execute gods-country --remote --file=data/dump-xxx.sql
 *
 * 注意一处不兼容：Node 版把留言图片存成 BLOB（guestbook.image），
 * D1 版改存 R2 的 key（guestbook.image_key），所以导出的 guestbook 不带图片，
 * 图片需要另外搬进 R2。这是有意的——D1 不适合塞 5MB 的二进制。
 */
import { db } from './db.js';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = process.argv[2] || join(root, 'data', `dump-${new Date().toISOString().slice(0, 10)}.sql`);

const quote = (v) => {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'bigint') return String(v);
  if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
    return `X'${Buffer.from(v).toString('hex')}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
};

const tables = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all();

const lines = [
  '-- 由 server/dump.mjs 生成，导入 D1：',
  '--   npx wrangler d1 execute gods-country --remote --file=' + outFile.split(/[\\/]/).pop(),
  '-- 不含留言图片：Node 版存 BLOB，D1 版存 R2 key，图片需另行上传。',
  'PRAGMA foreign_keys = OFF;',
  'BEGIN TRANSACTION;',
  '',
];

for (const t of tables) {
  lines.push(`DROP TABLE IF EXISTS ${t.name};`);
  lines.push(t.sql.replace(/\s+/g, ' ').trim() + ';');
}

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t.name})`).all().map((c) => c.name);
  // guestbook.image 是 BLOB，D1 那张表没有这一列
  const use = t.name === 'guestbook' ? cols.filter((c) => c !== 'image') : cols;
  const rows = db.prepare(`SELECT ${use.join(', ')} FROM ${t.name}`).all();
  lines.push(`-- ${t.name}: ${rows.length} 行`);
  for (const r of rows) {
    lines.push(`INSERT INTO ${t.name} (${use.join(', ')}) VALUES (${use.map((c) => quote(r[c])).join(', ')});`);
  }
  lines.push('');
}

lines.push('COMMIT;', 'PRAGMA foreign_keys = ON;', '');
writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log('已导出', outFile, `（${tables.map((t) => t.name).join(', ')}）`);
