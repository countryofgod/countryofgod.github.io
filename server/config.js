import { resolve, join } from 'node:path';
import { projectRoot } from './db.js';

export const config = {
  port: Number(process.env.PORT) || 3000,
  /** 管理页入口；改这里可以隐藏后台路径 */
  adminPath: '/admin',
  dataDir: process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(projectRoot, 'data'),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 7,
  cookieSecure: process.env.COOKIE_SECURE === '1',
  /** 留言图片单张上限 5MB */
  maxImageBytes: Number(process.env.MAX_IMAGE_BYTES) || 5 * 1024 * 1024,
  /** 首页 SSR 首批留言条数 */
  guestbookSsrLimit: Number(process.env.GUESTBOOK_SSR_LIMIT) || 50,
};
