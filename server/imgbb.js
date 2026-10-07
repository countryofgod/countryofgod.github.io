/**
 * ImgBB 图床上传。Node 版与 Workers 版共用这一份。
 *
 * 为什么需要它：Cloudflare R2 要在面板里手动开通，没开通时 Worker 里就没有 IMAGES 绑定，
 * 图片存不下来。ImgBB 是免费图床（https://api.imgbb.com），key 免费申请，
 * 上传后返回一个永久 URL —— 我们只把这个 URL 存进数据库，图片本体托管在图床。
 *
 * 代价要说清楚：图片不在自己手里。图床哪天关停或改策略，历史图片会失效。
 * 所以解析顺序是 R2 优先、ImgBB 兜底 —— R2 一开通就自动切回自己存，无需改代码。
 */
import { Unavailable } from './validators.js';

const ENDPOINT = 'https://api.imgbb.com/1/upload';

export async function uploadToImgbb({ apiKey, data, mime, filename }) {
  if (!apiKey) throw new Unavailable('没有配置 ImgBB API Key', 'image');

  const form = new FormData();
  form.append('image', new Blob([data], { type: mime }), filename || 'image');

  let res;
  try {
    // key 只能放 query string，这是 ImgBB 的接口规定
    res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, { method: 'POST', body: form });
  } catch (err) {
    throw new Unavailable('连不上图床，先只留文字吧', 'image');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) {
    const why = json?.error?.message || `HTTP ${res.status}`;
    throw new Unavailable(`图片存不下来（${why}），先只留文字吧`, 'image');
  }

  return { url: json.data.display_url || json.data.url, deleteUrl: json.data.delete_url || null };
}
