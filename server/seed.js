import { pathToFileURL } from 'node:url';
import { seedArticle, seedArchive } from './seed-data.js';

/**
 * 首次启动、articles 表为空时，把重构前硬编码在 index.html 里的《创刊号》
 * 原样写进数据库——字段来源：
 *   title   <h3 class="article-title">创刊号</h3>
 *   author  <p class="article-author">— 编辑部</p>（去掉模板负责拼接的 "— " 前缀）
 *   meta    <p class="article-meta">2026.10.05 · 发刊词</p> → publishedAt 2026-10-05 / category 发刊词
 *   excerpt <p class="article-excerpt">…</p>
 *   content <p class="article-full">…</p>（保留原文里的 <br><br>）
 *   archive 2026 年 10 月格子里的那一条 .month-post
 */
export function seedIfEmpty(db) {
  const row = db.prepare('SELECT COUNT(*) AS n FROM articles').get();
  if (row.n > 0) return false;

  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const info = db
      .prepare(
        `INSERT INTO articles (slug, title, author, published_at, category, excerpt, content, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        seedArticle.slug,
        seedArticle.title,
        seedArticle.author,
        seedArticle.publishedAt,
        seedArticle.category,
        seedArticle.excerpt,
        seedArticle.content,
        seedArticle.sortOrder,
        now
      );
    db.prepare('INSERT INTO archive_entries (year, month, article_id) VALUES (?, ?, ?)').run(
      seedArchive.year,
      seedArchive.month,
      Number(info.lastInsertRowid)
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return true;
}

// 直接执行：node server/seed.js —— 触发一次建表 + seed
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { dbPath, seeded } = await import('./db.js');
  console.log(seeded ? '已导入初始内容 →' : 'articles 表非空，跳过 →', dbPath);
}
