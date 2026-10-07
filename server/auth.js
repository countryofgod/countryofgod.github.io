import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { registerDevice } from './queries.js';

const COOKIE_NAME = 'gc_admin';

function ensureDataDir() {
  if (!existsSync(config.dataDir)) mkdirSync(config.dataDir, { recursive: true });
  return config.dataDir;
}

/** 读一个"没有就生成并落盘"的密钥文件，避免每次重启都要重新告知口令 */
function loadOrCreate(fileName, envValue) {
  if (envValue) return { value: envValue, generated: false };
  const file = join(ensureDataDir(), fileName);
  if (existsSync(file)) return { value: readFileSync(file, 'utf8').trim(), generated: false };
  const value = randomBytes(24).toString('base64url');
  writeFileSync(file, value, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* Windows 无 POSIX mode，忽略 */
  }
  return { value, generated: true };
}

const password = loadOrCreate('admin.password', config.adminPassword);
const secret = loadOrCreate('session.secret', config.sessionSecret);

export const adminPasswordGenerated = password.generated;
export const adminPasswordFile = join(config.dataDir, 'admin.password');

/** 定长比较：先把两侧都压成 32 字节摘要，长度恒定，不泄露口令长度 */
export function verifyPassword(input) {
  if (typeof input !== 'string') return false;
  const a = createHash('sha256').update(input, 'utf8').digest();
  const b = createHash('sha256').update(password.value, 'utf8').digest();
  return timingSafeEqual(a, b);
}

function sign(payload) {
  return createHmac('sha256', secret.value).update(payload).digest('base64url');
}

function safeEqualText(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function issueCookie(res) {
  const exp = Date.now() + config.sessionTtlDays * 86400_000;
  const payload = String(exp);
  const value = `${payload}.${sign(payload)}`;
  res.cookie(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: config.sessionTtlDays * 86400_000,
  });
}

export function clearCookie(res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}

export function isAdmin(req) {
  const raw = req.cookies?.[COOKIE_NAME];
  if (!raw) return false;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return false;
  const payload = raw.slice(0, idx);
  const mac = raw.slice(idx + 1);
  if (!safeEqualText(mac, sign(payload))) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

/** 管理接口：未登录返回 401 JSON */
export function requireAdminApi(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

/** 管理页面：未登录跳登录视图 */
export function requireAdminPage(req, res, next) {
  if (isAdmin(req)) return next();
  res.redirect(config.adminPath);
}

/* ---------------- 设备即账号 ----------------
 * 不做注册登录：第一次访问时由服务端发一个随机设备号，签进 httpOnly Cookie。
 * 它是"这台设备在这里的身份"，用来认领自己留过的言、记住上次用的名字。
 * 不绑定手机号、邮箱、密码 —— 换设备就是新身份，这也是有意的：不为了留存去换隐私。
 */
const DEVICE_COOKIE = 'gc_dev';
const DEVICE_MAX_AGE_MS = 365 * 86400_000;

/** 设备号本身不含隐私，仍然签名：否则改一下 Cookie 就能冒充别人的设备删留言 */
export const deviceToken = (id) => `${id}.${sign(id)}`;

export function readDeviceId(req) {
  const raw = req.cookies?.[DEVICE_COOKIE];
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  return safeEqualText(raw.slice(idx + 1), sign(id)) ? id : null;
}

/** 中间件：没有设备号就现场登记一个，并写进响应 */
export function ensureDevice(req, res, next) {
  const existing = readDeviceId(req);
  if (existing) {
    req.deviceId = existing;
    return next();
  }
  const id = randomBytes(16).toString('hex');
  req.deviceId = id;
  res.cookie(DEVICE_COOKIE, deviceToken(id), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    maxAge: DEVICE_MAX_AGE_MS / 1000,
  });
  registerDevice(id);
  next();
}

export function clearDeviceCookie(res) {
  res.clearCookie(DEVICE_COOKIE, { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' });
}
