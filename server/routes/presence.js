import { Router } from 'express';
import { hasEchoTarget, touchPresence } from '../queries.js';

const router = Router();

/**
 * POST /api/presence —— 阅读页的心跳：此刻还有一个人在读这篇吗。
 * body {articleId}，回答 {another: true|false}——只答有/没有，不报人数。
 * 阅读页每 30 秒打一次（public/js/article.js），90 秒内的心跳算"此刻"。
 */
router.post('/api/presence', (req, res, next) => {
  try {
    const articleId = req.body?.articleId;
    if (!hasEchoTarget(articleId)) return res.status(404).json({ error: 'not found' });
    if (!req.deviceId) return res.status(403).json({ error: '这台设备还没有身份' });
    res.set('Cache-Control', 'no-store');
    res.json(touchPresence(articleId, req.deviceId));
  } catch (err) {
    next(err);
  }
});

export default router;
