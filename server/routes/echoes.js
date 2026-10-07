import { Router } from 'express';
import { validateEcho, validateDraft, Conflict } from '../validators.js';
import { isAdmin } from '../auth.js';
import {
  getArticleById,
  listEchoes,
  myEcho,
  createEcho,
  deleteEchoAs,
  getDraft,
  putDraft,
  clearDraft,
} from '../queries.js';

const router = Router();

/* ---------------- 回声 ---------------- */

/** GET /api/echoes?article=:id —— 按时间正序。不给条数、不排序、不分页 */
router.get('/api/echoes', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ items: listEchoes(Number(req.query.article)) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/echoes/mine?article=:id —— 这篇我留过吗（一台设备一篇一次） */
router.get('/api/echoes/mine', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ echo: myEcho(Number(req.query.article), req.deviceId ?? null) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/echoes —— 一篇一次；留过了就 409，先撤回才能重留 */
router.post('/api/echoes', (req, res, next) => {
  try {
    const articleId = Number(req.body?.articleId);
    if (!getArticleById(articleId)) return res.status(404).json({ error: '文章不存在' });
    if (!req.deviceId) return res.status(403).json({ error: '这台设备还没有身份' });
    if (myEcho(articleId, req.deviceId)) {
      throw new Conflict('这篇你已经留过回声了，先撤回才能重留', 'body');
    }
    res.status(201).json(createEcho(articleId, req.deviceId, validateEcho(req.body ?? {})));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/echoes/:id —— 本人撤回；管理员撤任意一条 */
router.delete('/api/echoes/:id', (req, res, next) => {
  try {
    const result = deleteEchoAs(Number(req.params.id), {
      deviceId: req.deviceId ?? null,
      isAdmin: isAdmin(req),
    });
    if (!result.ok) {
      if (result.reason === 'forbidden') return res.status(403).json({ error: '这条不是你留的' });
      return res.status(404).json({ error: 'not found' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ---------------- 草稿：写到一半 ---------------- */

/** GET /api/drafts?slot=guestbook|echo:<id> */
router.get('/api/drafts', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ draft: getDraft(req.deviceId ?? null, String(req.query.slot || 'guestbook')) });
  } catch (err) {
    next(err);
  }
});

/** PUT /api/drafts —— 随打字自动存，绑在设备上 */
router.put('/api/drafts', (req, res, next) => {
  try {
    const data = validateDraft(req.body ?? {});
    if (!req.deviceId) return res.status(403).json({ error: '这台设备还没有身份' });
    res.json({ draft: putDraft(req.deviceId, data) });
  } catch (err) {
    next(err);
  }
});

router.delete('/api/drafts', (req, res, next) => {
  try {
    clearDraft(req.deviceId ?? null, String(req.query.slot || 'guestbook'));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
