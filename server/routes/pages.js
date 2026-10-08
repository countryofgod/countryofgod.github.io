import { Router } from 'express';
import { config } from '../config.js';
import { isAdmin, verifyPassword, issueCookie, clearCookie } from '../auth.js';
import {
  listArticles,
  getArchive,
  listGuestbook,
  listArchiveEntries,
  guestbookStats,
  getArticleBySlug,
  randomArticle,
  isArchived,
  listEchoes,
  getDailyByDate,
  todayIso,
} from '../queries.js';

const router = Router();

/** GET / —— 服务端渲染：文章、档案馆、首批留言全部在 HTML 里，首屏无加载空窗 */
router.get('/', (req, res, next) => {
  try {
    res.render('index', {
      articles: listArticles(),
      archive: getArchive(),
      notes: listGuestbook({ limit: config.guestbookSsrLimit }),
      submitMail: process.env.SUBMIT_MAIL || 'afterrainnn@outlook.com',
      admin: isAdmin(req),
      // 「每日」右栏不再由服务端渲染：内容来自仓库里的 daily/<分类>/*.txt，
      // 由前端按当天日期取（见 public/js/site.js 的 Daily 段）
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /p/:slug —— 文章永久页。
 * 发布后半年内可以直接打开全文；半年之后这篇沉入档案馆，只剩「已入档」视图，
 * 正文要等随机翻到它（?r=1）才展开。
 */
router.get('/p/:slug', (req, res, next) => {
  try {
    const article = getArticleBySlug(req.params.slug);
    if (!article) return res.status(404).type('text/plain; charset=utf-8').send('404 没有这篇');

    const archived = isArchived(article);
    const viaRandom = req.query.r === '1';
    res.render('article', {
      article,
      archived,
      // 随机是唯一能翻到旧文的门，不受半年窗口限制
      readable: !archived || viaRandom,
      echoes: listEchoes(article.id),
      submitMail: process.env.SUBMIT_MAIL || 'afterrainnn@outlook.com',
    });
  } catch (err) {
    next(err);
  }
});

/** GET /random —— 随便一篇。不分时间，任何一年的都可能被翻出来 */
router.get('/random', (req, res, next) => {
  try {
    const article = randomArticle();
    if (!article) return res.redirect('/');
    res.redirect(`/p/${encodeURIComponent(article.slug)}?r=1`);
  } catch (err) {
    next(err);
  }
});

/** GET /admin —— 未登录渲染登录视图，登录后渲染管理台 */
router.get(config.adminPath, (req, res, next) => {
  try {
    const authed = isAdmin(req);
    res.render('admin', {
      authed,
      loginError: req.query.e === '1',
      adminPath: config.adminPath,
      articles: authed ? listArticles() : [],
      archiveEntries: authed ? listArchiveEntries() : [],
      notes: authed ? listGuestbook({ limit: 200 }) : [],
      stats: authed ? guestbookStats() : null,
      // 「本日 Daily」面板：默认填今天这一条；还没有就填一个今天的空壳，方便直接写
      daily: authed
        ? getDailyByDate(todayIso()) ?? { date: todayIso(), category: 'article', title: '', body: '' }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/** POST /admin/login —— 表单与 fetch 两种入口都支持 */
router.post(`${config.adminPath}/login`, (req, res, next) => {
  try {
    if (!verifyPassword(req.body?.password)) {
      if (req.accepts('html') && !req.is('json')) return res.redirect(`${config.adminPath}?e=1`);
      return res.status(401).json({ error: '口令不正确' });
    }
    issueCookie(res);
    if (req.is('json')) return res.json({ ok: true });
    return res.redirect(config.adminPath);
  } catch (err) {
    next(err);
  }
});

router.post(`${config.adminPath}/logout`, (req, res) => {
  clearCookie(res);
  if (req.is('json')) return res.json({ ok: true });
  return res.redirect(config.adminPath);
});

export default router;
