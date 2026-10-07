/** §6.3 的系统边界校验：所有进入数据库的用户输入都先过这里 */

export const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const LIMITS = {
  name: 24,
  body: 500,
  title: 100,
  author: 40,
  category: 30,
  slug: 120,
  excerpt: 1000,
  content: 20000,
};

class Invalid extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
    this.status = 400;
  }
}

/** 冲突：这篇已收录不能再改 / 这篇你已经留过回声了 */
class Conflict extends Error {
  constructor(message, field) {
    super(message);
    this.field = field;
    this.status = 409;
  }
}

const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));

/** 去首尾空白；空串归一为 null（数据库里"没有"就是 NULL） */
function optionalText(value, field, max) {
  const text = str(value).trim();
  if (!text) return null;
  if (text.length > max) throw new Invalid(`${field} 不能超过 ${max} 个字符`, field);
  return text;
}

function requiredText(value, field, max) {
  const text = str(value).trim();
  if (!text) throw new Invalid(`${field} 不能为空`, field);
  if (text.length > max) throw new Invalid(`${field} 不能超过 ${max} 个字符`, field);
  return text;
}

export function validateGuestbook({ name, body, image, maxImageBytes }) {
  const out = {
    name: optionalText(name, 'name', LIMITS.name),
    body: optionalText(body, 'body', LIMITS.body),
  };
  if (!out.body && !image) throw new Invalid('留言内容与图片至少填一样', 'body');

  let imageRow = null;
  if (image) {
    if (!IMAGE_MIME.has(image.mimetype)) throw new Invalid('只支持 PNG / JPEG / GIF / WebP 图片', 'image');
    if (image.size > maxImageBytes) {
      throw new Invalid(`图片不能超过 ${Math.round(maxImageBytes / 1024 / 1024)} MB`, 'image');
    }
    imageRow = { data: image.buffer, mime: image.mimetype, bytes: image.size };
  }
  return { ...out, image: imageRow };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateArticle(input) {
  const rawSlug = str(input.slug).trim();
  const title = requiredText(input.title, 'title', LIMITS.title);
  const slug = rawSlug
    ? rawSlug.toLowerCase()
    : title
        .toLowerCase()
        .replace(/[^a-z0-9一-龥]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, LIMITS.slug) || `article-${Date.now()}`;
  if (slug.length > LIMITS.slug) throw new Invalid('slug 过长', 'slug');
  // 允许中文 slug；只要不含会破坏 URL 的字符即可
  if (/[\s/\\?#%]/.test(slug)) throw new Invalid('slug 不能含空格或 / ? # 等字符', 'slug');

  const publishedAt = str(input.publishedAt).trim() || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(publishedAt)) throw new Invalid('日期须为 YYYY-MM-DD', 'publishedAt');
  const d = new Date(`${publishedAt}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Invalid('日期无效', 'publishedAt');

  return {
    slug,
    title,
    author: optionalText(input.author, 'author', LIMITS.author) ?? '编辑部',
    publishedAt,
    category: optionalText(input.category, 'category', LIMITS.category),
    excerpt: requiredText(input.excerpt, 'excerpt', LIMITS.excerpt),
    content: requiredText(input.content, 'content', LIMITS.content),
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
  };
}

export function validateArchiveEntry(input) {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 1900 || year > 2999) throw new Invalid('年份须在 1900–2999 之间', 'year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Invalid('月份须在 1–12 之间', 'month');
  const articleId = Number(input.articleId);
  if (!Number.isInteger(articleId) || articleId <= 0) throw new Invalid('必须选择一篇文章', 'articleId');
  return { year, month, articleId };
}

/** 校验回声：一句话，不附图；昵称可空 */
export function validateEcho(input) {
  const body = str(input.body).trim();
  if (!body) throw new Invalid('说点什么再留', 'body');
  if (body.length > LIMITS.body) throw new Invalid(`回声不能超过 ${LIMITS.body} 个字符`, 'body');
  return { body, name: optionalText(input.name, 'name', LIMITS.name) };
}

/** 草稿：只允许一段正文 + 可选署名，长度同样封顶 */
export function validateDraft(input) {
  return {
    slot: str(input.slot).trim().slice(0, 64) || 'guestbook',
    name: optionalText(input.name, 'name', LIMITS.name),
    body: str(input.body).slice(0, LIMITS.content),
  };
}

/** 把校验/业务异常统一映射到 HTTP 状态码 */
export function errorStatus(err) {
  const s = err?.status;
  return s === 400 || s === 404 || s === 401 || s === 403 || s === 409 || s === 413 ? s : 500;
}

export { Invalid, Conflict };
