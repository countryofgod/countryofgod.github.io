/** 口令校验 + HMAC-SHA256 签名 Cookie。全部走 WebCrypto（Workers 上没有 node:crypto） */

const COOKIE = 'gc_admin';
const enc = new TextEncoder();

const b64url = (buf) => {
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(env, payload) {
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || 'dev-secret';
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

const digest = (s) => crypto.subtle.digest('SHA-256', enc.encode(s));

/** 先把两侧压成等长十六进制摘要再比，长度不随口令长度泄露 */
export async function verifyPassword(env, input) {
  if (typeof input !== 'string' || !env.ADMIN_PASSWORD) return false;
  return hex(await digest(input)) === hex(await digest(env.ADMIN_PASSWORD));
}

/**
 * secure 由调用方按请求协议判断：Workers 无论 *.workers.dev 还是自定义域名都是 https，
 * 但 wrangler dev 是 http —— 写死 Secure 会让本地登录不进去，所以跟着协议走。
 */
export async function cookieHeader(env, { secure = false } = {}) {
  const days = Number(env.SESSION_TTL_DAYS) || 7;
  const exp = Date.now() + days * 86400_000;
  const payload = String(exp);
  const value = `${payload}.${await sign(env, payload)}`;
  const parts = [`${COOKIE}=${value}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${days * 86400}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearedCookieHeader = ({ secure = false } = {}) =>
  `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;

export async function isAdmin(env, req) {
  const raw = getCookie(req, COOKIE);
  if (!raw) return false;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return false;
  const payload = raw.slice(0, idx);
  const mac = raw.slice(idx + 1);
  const expect = await sign(env, payload);
  if (mac.length !== expect.length || mac !== expect) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

/* ---------------- 设备即账号 ----------------
 * 不做注册登录：第一次访问时发一串随机号，签进 httpOnly Cookie。
 * 它是"这台设备在这里的身份"，用来认领自己留过的言、记住上次用的名字。
 * 换设备就是新身份 —— 这是有意的：不为留存去换隐私。
 */
const DEVICE_COOKIE = 'gc_dev';
const DEVICE_MAX_AGE = 365 * 86400;

const randomId = () => {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};

/** 设备号不含隐私，仍要签名：否则改一下 Cookie 就能冒充别人的设备删留言 */
const deviceToken = async (env, id) => `${id}.${await sign(env, id)}`;

export async function readDeviceId(env, req) {
  const raw = getCookie(req, DEVICE_COOKIE);
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = raw.slice(0, idx);
  return (await sign(env, id)) === raw.slice(idx + 1) ? id : null;
}

/** 没有设备号就现场登记一个；返回要给响应补的 Set-Cookie（没有则 null） */
export async function ensureDevice(env, req) {
  const existing = await readDeviceId(env, req);
  if (existing) return { id: existing, setCookie: null };
  const id = randomId();
  const secure = env.COOKIE_SECURE === '1' || new URL(req.url).protocol === 'https:';
  const parts = [
    `${DEVICE_COOKIE}=${await deviceToken(env, id)}`,
    'HttpOnly',
    // 跨域（github.io 静态页调本站留言接口）时浏览器要肯带上这个 Cookie，所以线上用 None；
    // None 必须配 Secure，本地 http 只能退回 Lax，否则浏览器直接把 Cookie 丢掉
    secure ? 'SameSite=None' : 'SameSite=Lax',
    'Path=/',
    `Max-Age=${DEVICE_MAX_AGE}`,
  ];
  if (secure) parts.push('Secure');
  return { id, setCookie: parts.join('; ') };
}

export function getCookie(req, name) {
  const raw = req.headers.get('Cookie');
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
