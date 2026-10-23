import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/article.js', import.meta.url), 'utf8');

class Element {
  constructor(className = '') {
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.listeners = new Map();
    this.value = '';
    this.hidden = false;
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  querySelector(selector) {
    const [, className, id] = selector.match(/^\.([\w-]+)(?:\[data-id="([^"]+)"\])?$/);
    for (const child of this.children) {
      if (child.className === className && (id == null || String(child.dataset.id) === id)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  dispatch(name) { return this.listeners.get(name)?.({ preventDefault() {} }); }
  remove() { this.parent.children = this.parent.children.filter((child) => child !== this); }
  setAttribute(name, value) { (this.attributes ??= {})[name] = value; }
}

async function setup(target, existing = null) {
  const section = new Element('echo');
  section.dataset.article = String(target);
  const form = section.appendChild(new Element('echo-form'));
  const list = section.appendChild(new Element('echo-list'));
  const input = form.appendChild(new Element('echo-input'));
  const textarea = form.appendChild(new Element('echo-textarea'));
  const submit = form.appendChild(new Element('echo-submit'));
  const hint = form.appendChild(new Element('echo-hint'));
  form.reset = () => { input.value = ''; textarea.value = ''; };
  if (existing) {
    const item = list.appendChild(new Element('echo-item'));
    item.dataset.id = existing.id;
  }
  let mine = existing;
  let timer;
  const requests = [];
  const body = new Element('body');
  const document = {
    querySelector: (selector) => selector === '.echo' ? section : section.querySelector(selector),
    createElement: () => new Element(),
    body,
    hidden: false,
    addEventListener() {},
  };
  const context = vm.createContext({
    document,
    confirm: () => true,
    encodeURIComponent,
    setTimeout: (handler) => { timer = handler; return 1; },
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    async fetch(url, options = {}) {
      requests.push({ url, ...options });
      let data = {};
      if (url.startsWith('/api/echoes/mine')) data = { echo: mine };
      else if (url === '/api/echoes' && options.method === 'POST') {
        const body = JSON.parse(options.body);
        mine = { id: 7, articleId: body.articleId, name: body.name, body: body.body, date: '2026.10.22' };
        data = mine;
      } else if (url.startsWith('/api/echoes/') && options.method === 'DELETE') mine = null;
      else if (url.startsWith('/api/drafts?') && !options.method) data = { draft: { name: '读者', body: '半截话' } };
      else if (url === '/api/presence') data = { another: false };
      return { ok: true, json: async () => data };
    },
  });
  vm.runInContext(source, context);
  await new Promise(setImmediate);
  return { section, form, list, input, textarea, submit, hint, requests, body, save: () => timer?.() };
}

for (const target of [1, 'daily:2026-10-15:article', 'daily:2026-10-15:poem', 'daily:2026-10-15:music']) {
  const app = await setup(target);
  assert.equal(app.textarea.value, '半截话');
  assert.equal(app.input.value, '读者');
  app.textarea.value = '留下回声';
  app.textarea.dispatch('input');
  app.save();
  const draftRequest = app.requests.find((request) => request.method === 'PUT');
  assert.equal(JSON.parse(draftRequest.body).slot, 'echo:' + target);
  await app.form.dispatch('submit');
  const post = app.requests.find((request) => request.url === '/api/echoes');
  assert.equal(JSON.parse(post.body).articleId, target);
  assert.equal(app.list.children.length, 1);
  assert.equal(app.form.hidden, true);
  assert.equal(app.submit.disabled, false);
  assert.equal(app.textarea.value, '');
  assert.ok(app.requests.some((request) => request.method === 'DELETE' && request.url === '/api/drafts?slot=' + encodeURIComponent('echo:' + target)));
  await app.list.querySelector('.echo-mine').dispatch('click');
  assert.ok(app.requests.some((request) => request.url === '/api/echoes/7?article=' + encodeURIComponent(target) && request.method === 'DELETE'));
  assert.equal(app.form.hidden, false);
  assert.equal(app.list.querySelector('.echo-item'), null);
  app.textarea.value = '重新留下';
  await app.form.dispatch('submit');
  assert.equal(app.form.hidden, true);

  const returning = await setup(target, { id: 8, body: '已留回声' });
  assert.equal(returning.form.hidden, true);
  assert.ok(returning.list.querySelector('.echo-mine'));
  assert.equal(returning.textarea.value, '');

  // 此刻在读：another:false 时角落那行字挂在页面上但保持隐藏
  const line = app.body.children.find((child) => child.className.startsWith('reading-with'));
  assert.equal(line.textContent, '此刻还有一个人在读这篇');
  assert.equal(line.className, 'reading-with');
  assert.ok(app.requests.some((request) => request.url === '/api/presence' && request.method === 'POST'));
}

console.log('PASS: all independent content types restore drafts, submit, clear drafts, lock duplicate forms, claim existing echoes, withdraw with scoped IDs and resubmit');
