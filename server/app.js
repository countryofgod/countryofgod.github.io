import express from 'express';
import multer from 'multer';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { db, dbPath, projectRoot, seeded } from './db.js';
import { adminPasswordGenerated, adminPasswordFile, ensureDevice } from './auth.js';
import { Invalid, errorStatus } from './validators.js';
import pages from './routes/pages.js';
import content from './routes/content.js';
import guestbook from './routes/guestbook.js';
import echoes from './routes/echoes.js';

const here = dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('view engine', 'ejs');
app.set('views', join(here, 'views'));
app.set('trust proxy', config.cookieSecure ? 1 : false);
app.disable('x-powered-by');

/** 极简 cookie 解析：只取管理会话那一个，避免为它引入额外依赖 */
app.use((req, _res, next) => {
  const raw = req.headers.cookie;
  req.cookies = {};
  if (raw) {
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      const k = part.slice(0, i).trim();
      if (!k) continue;
      req.cookies[k] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// 静态资源：字体与图片内容不可变，强缓存一年。
// 目录放在项目根的 public/，与 Cloudflare Workers 的 [assets] 共用同一份
app.use(
  express.static(join(projectRoot, 'public'), {
    maxAge: '365d',
    immutable: true,
    setHeaders(res, filePath) {
      if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      }
    },
  })
);

// 健康检查：给外部探活用，连一次库，库挂了就 503
app.get('/healthz', (_req, res) => {
  try {
    const row = db.prepare('SELECT COUNT(*) AS n FROM articles').get();
    res.set('Cache-Control', 'no-store').json({ ok: true, articles: row?.n ?? 0 });
  } catch (err) {
    res.set('Cache-Control', 'no-store').status(503).json({ ok: false, error: '数据库不可用' });
  }
});

// 设备即账号：放在静态目录之后，免得给 css/js/图片也挂上 Cookie
app.use(ensureDevice);

app.use(pages);
app.use(content);
app.use(guestbook);
app.use(echoes);

app.use((_req, res) => {
  res.status(404).type('text/plain; charset=utf-8').send('404 页面不存在');
});

app.use((err, req, res, _next) => {
  let status = errorStatus(err);
  let message = err?.message || '服务器内部错误';

  if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? '图片太大了' : '上传失败';
  } else if (err instanceof Invalid) {
    status = 400;
  } else {
    console.error('[error]', req.method, req.originalUrl, err);
  }

  // 只有"没预料到的错误"才泛化；Unavailable 这类是专门写给用户的提示，原样传出
  if (status === 500) message = '服务器内部错误';
  res.status(status).json({ error: message, field: err?.field ?? null });
});

const server = app.listen(config.port, () => {
  console.log(`上帝之国 · 服务已启动  http://localhost:${config.port}`);
  console.log(`数据库  ${dbPath}${seeded ? '（首次启动，已导入《创刊号》初始内容）' : ''}`);
  console.log(`管理台  http://localhost:${config.port}${config.adminPath}`);
  if (adminPasswordGenerated) {
    // 这一行刻意用英文：Windows 控制台可能是 GBK 代码页，中文会乱码，
    // 而这是"第一次启动去哪儿找口令"的关键信息，必须读得出来
    console.log(`! ADMIN_PASSWORD not set -> a random one was generated and saved to ${adminPasswordFile}`);
  }
});

const shutdown = () => {
  server.close(() => {
    try {
      db.close();
    } catch {
      /* 已关闭 */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { app };
