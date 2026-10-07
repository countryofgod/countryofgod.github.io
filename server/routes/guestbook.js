import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { IMAGE_MIME, validateGuestbook, Invalid } from '../validators.js';
import { requireAdminApi } from '../auth.js';
import {
  listGuestbook,
  insertGuestbook,
  getGuestbookImage,
  deleteGuestbookAs,
  myGuestbook,
} from '../queries.js';
import { isAdmin } from '../auth.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1, fields: 8, fieldSize: 8 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIME.has(file.mimetype)) {
      return cb(new Invalid('只支持 PNG / JPEG / GIF / WebP 图片', 'image'));
    }
    cb(null, true);
  },
});

/** GET /api/guestbook?limit=&before= —— 最新在前 */
router.get('/api/guestbook', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const before = req.query.before ? Number(req.query.before) : null;
    res.json({ items: listGuestbook({ limit, before: Number.isFinite(before) ? before : null }) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/guestbook —— multipart: name / body / image */
router.post('/api/guestbook', (req, res, next) => {
  upload.single('image')(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file && !req.is('multipart/form-data')) {
        return res.status(400).json({ error: '请以 multipart/form-data 提交', field: 'image' });
      }
      const data = validateGuestbook({
        name: req.body?.name,
        body: req.body?.body,
        image: req.file,
        maxImageBytes: config.maxImageBytes,
      });
      res.status(201).json(await insertGuestbook({ ...data, deviceId: req.deviceId ?? null }));
    } catch (e) {
      next(e);
    }
  });
});

/** GET /api/guestbook/:id/image —— 图片二进制流 */
router.get('/api/guestbook/:id/image', (req, res, next) => {
  try {
    const row = getGuestbookImage(Number(req.params.id));
    if (!row || !row.image) return res.status(404).end();
    const buf = Buffer.from(row.image);
    // 内容不可变：id 变了才换 URL，故可长期强缓存
    res.setHeader('Content-Type', row.image_mime || 'application/octet-stream');
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', `W/"gb-${req.params.id}"`);
    if (req.headers['if-none-match'] === `W/"gb-${req.params.id}"`) return res.status(304).end();
    res.end(buf);
  } catch (err) {
    next(err);
  }
});

/** GET /api/guestbook/mine —— 「我的」：这台设备留过的言 + 上次用的名字。
 *  单独一个接口、不走 SSR，是为了让首页保持与设备无关（可被缓存、不串号） */
router.get('/api/guestbook/mine', (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(myGuestbook(req.deviceId ?? null));
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/guestbook/:id —— 管理员删任意一条；本人只能撤回自己那条 */
router.delete('/api/guestbook/:id', (req, res, next) => {
  try {
    const result = deleteGuestbookAs(Number(req.params.id), {
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

export default router;
