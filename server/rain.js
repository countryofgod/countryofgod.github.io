/**
 * 雨天，过刊可读。
 * 沉入档案馆的文章，在读者所在地正在下雨时可以直接打开——页面上不提示、
 * 不解释，与半年内的可读视图完全一样。唯一的规则例外，见 README「文章永久页」。
 *
 * 定位不取自浏览器（不弹权限框），只取平台侧已有的城市级坐标：
 *   Workers 版用 request.cf.latitude / longitude；
 *   Node 版没有 cf，反向代理可注入 x-geo-latitude / x-geo-longitude 两个头，
 *   没有就当作不下雨（门关着），不额外请求任何定位服务。
 * 天气查 Open-Meteo（免密钥），按四舍五入到两位小数的坐标缓存 10 分钟；
 * 查询失败、超时（2.5s）一律视为不下雨——例外态宁可不出现。
 */

// WMO weather interpretation codes 里的"雨"：毛毛雨、冻毛毛雨、雨、冻雨、阵雨、雷暴。
// 雪（71–77、85、86）不算——落下来的是雨，门才开。
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

const CACHE_TTL_MS = 10 * 60_000;
const cache = new Map(); // 'lat,lon' → { rain, at }

const roundCoords = (lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: lat.toFixed(2), lon: lon.toFixed(2) };
};

/** Workers 版：request.cf 里的城市级坐标（字符串，可能缺失） */
export function coordsFromCf(cf) {
  return roundCoords(Number(cf?.latitude), Number(cf?.longitude));
}

/** Node 版：反向代理注入的头。兼容 Headers 实例与普通对象两种 req.headers */
export function coordsFromHeaders(headers) {
  if (!headers) return null;
  const get = typeof headers.get === 'function' ? (n) => headers.get(n) : (n) => headers[n];
  return roundCoords(Number(get('x-geo-latitude')), Number(get('x-geo-longitude')));
}

/** 是否正在下雨。没有坐标直接 false（连 Open-Meteo 都不去） */
export async function isRaining(coords, fetcher = fetch) {
  if (!coords) return false;
  const key = `${coords.lat},${coords.lon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rain;

  let rain = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetcher(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=weather_code`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    const data = await res.json();
    rain = RAIN_CODES.has(Number(data?.current?.weather_code));
  } catch {
    rain = false;
  }

  if (cache.size > 64) cache.clear();
  cache.set(key, { rain, at: Date.now() });
  return rain;
}
