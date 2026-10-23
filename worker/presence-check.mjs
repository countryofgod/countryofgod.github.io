/**
 * 验收两件事（克制版）：
 *   1. server/rain.js —— 雨天判定：坐标解析、WMO 雨码、缓存、失败当不下雨
 *   2. public/js/article.js 的「此刻还有一个人在读这篇」——
 *      another:true 才出现，false 保持隐藏，且心跳带上正确的 articleId
 * 运行：node worker/presence-check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { coordsFromCf, coordsFromHeaders, isRaining } from '../server/rain.js';

/* ---------------- 雨天判定 ---------------- */

// 无坐标：直接 false，且不去请求天气
let fetched = 0;
assert.equal(await isRaining(null, async () => { fetched += 1; }), false);
assert.equal(fetched, 0);

// 坐标解析：Workers 的 request.cf（字符串字段）
assert.deepEqual(coordsFromCf({ latitude: '31.23', longitude: '121.47' }), { lat: '31.23', lon: '121.47' });
assert.equal(coordsFromCf({}), null);
assert.equal(coordsFromCf({ latitude: 'abc' }), null);
// Node 的 req.headers：Headers 实例与普通对象两种都要能读
assert.deepEqual(coordsFromHeaders(new Headers({ 'x-geo-latitude': '39.90', 'x-geo-longitude': '116.40' })), { lat: '39.90', lon: '116.40' });
assert.deepEqual(coordsFromHeaders({ 'x-geo-latitude': '39.904', 'x-geo-longitude': '116.407' }), { lat: '39.90', lon: '116.41' });
assert.equal(coordsFromHeaders({}), null);
// 越界坐标不算
assert.equal(coordsFromHeaders({ 'x-geo-latitude': '91', 'x-geo-longitude': '0' }), null);

// WMO 天气码：雨开、雪与晴不开（每组用不同坐标，避开模块级缓存）
const code = (weather_code) => async () => ({ json: async () => ({ current: { weather_code } }) });
assert.equal(await isRaining({ lat: '10.00', lon: '10.00' }, code(63)), true);   // 雨
assert.equal(await isRaining({ lat: '11.00', lon: '11.00' }, code(51)), true);   // 毛毛雨
assert.equal(await isRaining({ lat: '12.00', lon: '12.00' }, code(95)), true);   // 雷暴
assert.equal(await isRaining({ lat: '13.00', lon: '13.00' }, code(71)), false);  // 雪：门不开
assert.equal(await isRaining({ lat: '14.00', lon: '14.00' }, code(0)), false);   // 晴
assert.equal(await isRaining({ lat: '15.00', lon: '15.00' }, code(undefined)), false);

// 请求失败 / 非 2xx 的 json 抛错：一律当不下雨
assert.equal(await isRaining({ lat: '16.00', lon: '16.00' }, async () => { throw new Error('timeout'); }), false);
assert.equal(await isRaining({ lat: '17.00', lon: '17.00' }, async () => ({ json: async () => { throw new Error('bad'); } })), false);

// 缓存：同一坐标第二次不再发请求
let calls = 0;
const counting = async () => { calls += 1; return code(61)(); };
assert.equal(await isRaining({ lat: '18.00', lon: '18.00' }, counting), true);
assert.equal(await isRaining({ lat: '18.00', lon: '18.00' }, counting), true);
assert.equal(calls, 1);

/* ---------------- 阅读页的角落一行字 ---------------- */

const source = readFileSync(new URL('../public/js/article.js', import.meta.url), 'utf8');

class Element {
  constructor(className = '') {
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  querySelector(selector) {
    const [, className] = selector.match(/^\.([\w-]+)/) || [];
    for (const child of this.children) {
      if (child.className === className) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  setAttribute(name, value) { (this.attributes ??= {})[name] = value; }
}

async function withAnother(another, target = 1) {
  const section = new Element('echo');
  section.dataset.article = String(target);
  const body = new Element('body');
  const document = {
    querySelector: (selector) => (selector === '.echo' ? section : null),
    createElement: () => new Element(),
    body,
    hidden: false,
    addEventListener() {},
  };
  const requests = [];
  const context = vm.createContext({
    document,
    confirm: () => true,
    encodeURIComponent,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    async fetch(url, options = {}) {
      requests.push({ url, ...options });
      let data = {};
      if (url.startsWith('/api/echoes/mine')) data = { echo: null };
      else if (url.startsWith('/api/drafts?')) data = { draft: null };
      else if (url === '/api/presence') data = { another };
      return { ok: true, json: async () => data };
    },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  const line = body.children.find((child) => child.className.startsWith('reading-with'));
  return { line, requests };
}

// 有人在：一行字出现（is-on），心跳带上 articleId
const yes = await withAnother(true);
assert.equal(yes.line.textContent, '此刻还有一个人在读这篇');
assert.equal(yes.line.className, 'reading-with is-on');
const beat = yes.requests.find((request) => request.url === '/api/presence');
assert.equal(beat.method, 'POST');
assert.equal(JSON.parse(beat.body).articleId, 1);

// 没人在：字还挂在那里（元素常在），但没有 is-on
const no = await withAnother(false);
assert.equal(no.line.className, 'reading-with');

// 每日内容页同理：articleId 是 daily:<date>:<category> 字符串
const daily = await withAnother(true, 'daily:2026-10-15:pub');
const dailyBeat = daily.requests.find((request) => request.url === '/api/presence');
assert.equal(JSON.parse(dailyBeat.body).articleId, 'daily:2026-10-15:pub');

console.log('PASS: rain gates the archive (rain yes, snow no, failures closed), presence line shows only when another reader is here');
