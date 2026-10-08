import { Router } from 'express';
import {
  listArticles,
  getArticleBySlug,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  getArchive,
  createArchiveEntry,
  deleteArchiveEntry,
  upsertDaily,
} from '../queries.js';
import { validateArticle, validateArchiveEntry, validateDaily, Invalid, Conflict } from '../validators.js';
import { requireAdminApi } from '../auth.js';

const router = Router();

/* ---------------- 公开读 ---------------- */

router.get('/api/articles', (req, res, next) => {
  try {
    res.json(listArticles());
  } catch (err) {
    next(err);
  }
});

router.get('/api/articles/:slug', (req, res, next) => {
  try {
    const a = getArticleBySlug(req.params.slug);
    if (!a) return res.status(404).json({ error: 'not found' });
    res.json(a);
  } catch (err) {
    next(err);
  }
});

router.get('/api/archive', (req, res, next) => {
  try {
    res.json(getArchive());
  } catch (err) {
    next(err);
  }
});

/* ---------------- 管理写 ---------------- */

router.post('/api/articles', requireAdminApi, (req, res, next) => {
  try {
    const data = validateArticle(req.body ?? {});
    if (getArticleBySlug(data.slug)) throw new Invalid('slug 已存在', 'slug');
    res.status(201).json(createArticle(data));
  } catch (err) {
    next(err);
  }
});

router.put('/api/articles/:id', requireAdminApi, (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const current = getArticleById(id);
    if (!current) return res.status(404).json({ error: 'not found' });
    // 收录后不改：进了档案馆就定稿，要改就另发一篇
    if (current.lockedAt) throw new Conflict('这篇已经收录，不能再改。要改就另发一篇。', 'content');
    const data = validateArticle(req.body ?? {});
    const dup = getArticleBySlug(data.slug);
    if (dup && dup.id !== id) throw new Invalid('slug 已存在', 'slug');
    res.json(updateArticle(id, data));
  } catch (err) {
    next(err);
  }
});

router.delete('/api/articles/:id', requireAdminApi, (req, res, next) => {
  try {
    const ok = deleteArticle(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/api/archive', requireAdminApi, (req, res, next) => {
  try {
    const data = validateArchiveEntry(req.body ?? {});
    if (!getArticleById(data.articleId)) throw new Invalid('文章不存在', 'articleId');
    const id = createArchiveEntry(data);
    if (!id) throw new Invalid('该月份里已经有这篇文章了', 'articleId');
    res.status(201).json({ id, ...data });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/archive/:id', requireAdminApi, (req, res, next) => {
  try {
    const ok = deleteArchiveEntry(Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/daily —— 写入/更新某一天的 Daily（默认今天）。
 * 一天一条（slot_date 唯一），同日再提交就是覆盖式更新，所以用 POST 而不是 PUT：
 * 调用方不需要先知道库里有没有这一天。
 */
router.post('/api/daily', requireAdminApi, (req, res, next) => {
  try {
    res.json(upsertDaily(validateDaily(req.body ?? {})));
  } catch (err) {
    next(err);
  }
});

export default router;
