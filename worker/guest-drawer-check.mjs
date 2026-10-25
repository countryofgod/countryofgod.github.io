import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/js/guest-drawer.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/css/site.css', import.meta.url), 'utf8');

class Element {
  constructor(className = '') {
    this.className = className;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.events = new Map();
    this.values = new Map();
    this.classes = new Set(className.split(' '));
    this.style = { setProperty: (key, value) => this.values.set(key, value) };
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (name) => this.classes.add(name),
      toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name),
    };
  }
  appendChild(child) {
    child.remove();
    child.parent = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  contains(element) { return element === this || this.children.some((child) => child.contains(element)); }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.classes.has(selector.slice(1))) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
  closest(selector) {
    return this.className === selector.slice(1) ? this : this.parent?.closest(selector);
  }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.parent = null; });
    this.children = [];
    children.forEach((child) => this.appendChild(child));
  }
  addEventListener(name, handler) { this.events.set(name, handler); }
  dispatch(name, event = {}) { return this.events.get(name)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getBoundingClientRect() { return this.rect || { left: 0, right: 0, top: 0, bottom: 0 }; }
  focus() { this.focused = true; }
}

const body = new Element();
body.classes.add('has-pager');
body.dataset.pagerActive = 'about';
const chapter = body.appendChild(new Element('pager-page'));
const area = chapter.appendChild(new Element('footer-guestbook'));
area.rect = { top: 64, bottom: 730 };
const form = area.appendChild(new Element('guest-form'));
form.rect = { left: 461, right: 979 };
const name = form.appendChild(new Element('guest-name'));
name.rect = { top: 120 };
const film = area.appendChild(new Element('guest-film'));
film.rect = { bottom: 680 };
const drawer = area.appendChild(new Element('guest-drawer'));
const handle = drawer.appendChild(new Element('guest-drawer-handle'));
const panel = drawer.appendChild(new Element('guest-drawer-panel'));
const wall = panel.appendChild(new Element('guest-wall'));
const navigation = panel.appendChild(new Element('guest-drawer-pages'));
const documentEvents = new Map();
const document = {
  body,
  documentElement: { clientWidth: 1440 },
  activeElement: null,
  querySelector: (selector) => body.querySelector(selector),
  createElement: () => new Element(),
  addEventListener(name, handler) {
    if (!documentEvents.has(name)) documentEvents.set(name, []);
    documentEvents.get(name).push(handler);
  },
};
let mutation;
let delayed;
let ownershipRefreshes = 0;
const requests = [];
const window = {
  innerHeight: 900,
  requestAnimationFrame: (handler) => { handler(); return 0; },
  addEventListener() {},
  matchMedia: () => ({ matches: true }),
  MutationObserver: true,
};
const context = vm.createContext({
  document, window, API_BASE: '',
  setInterval: () => 1,
  clearInterval() {},
  MutationObserver: class { constructor(handler) { mutation = handler; } observe() {} },
  getComputedStyle: () => ({ getPropertyValue: (key) => key.includes('width') ? (key.includes('handle') ? '32px' : '56px') : '' }),
  renderNote: (item) => {
    const note = new Element('guest-note');
    note.dataset.id = String(item.id);
    return note;
  },
  markMyNotes: () => { ownershipRefreshes += 1; },
  async fetch(url) {
    const page = Number(new URL(url, 'http://local').searchParams.get('page'));
    requests.push(page);
    if (page === 2) await new Promise((resolve) => { delayed = resolve; });
    return { ok: true, json: async () => ({ page, pages: 3, items: [{ id: page * 10 }] }) };
  },
});
vm.runInContext(source, context);
await new Promise(setImmediate);
assert.equal(drawer.parent, body);
assert.equal(drawer.values.get('--guest-drawer-left'), '1035px');
assert.equal(drawer.values.get('--guest-drawer-top'), '120px');
assert.equal(drawer.values.get('--guest-drawer-height'), '560px');
assert.equal(drawer.values.get('--guest-drawer-width'), '301px');
assert.equal(drawer.values.get('--guest-drawer-trigger'), '-44px');
assert.equal(panel.inert, true);
// 雨滴效果已按用户要求删除：页面与样式里都不应再有 .guest-rain
assert.ok(!body.children.some((child) => child.className === 'guest-rain'), 'rain canvas removed');
assert.ok(!css.includes('.guest-rain'), 'rain styles removed');
assert.ok(!source.includes('guest-rain'), 'rain engine removed from the script');
drawer.dispatch('focusin');
assert.equal(panel.inert, false);
drawer.dispatch('focusout', { relatedTarget: wall });
assert.equal(panel.inert, false);
drawer.dispatch('focusout', { relatedTarget: null });
assert.equal(panel.inert, true);
handle.dispatch('click');
documentEvents.get('click').forEach((handler) => handler({ target: wall }));
assert.equal(panel.inert, false);
drawer.dispatch('keydown', { key: 'Escape' });
assert.equal(panel.inert, true);
assert.equal(handle.focused, true);
handle.dispatch('click');
documentEvents.get('click').forEach((handler) => handler({ target: form }));
assert.equal(panel.inert, true);
assert.equal(navigation.children.length, 3);
assert.equal(wall.children[0].dataset.id, '10');
drawer.dispatch('mouseenter');
assert.equal(handle.attributes.get('aria-expanded'), 'true');
assert.equal(panel.inert, false);
drawer.dispatch('mouseleave');
assert.equal(panel.inert, true);
handle.dispatch('click');
drawer.dispatch('mouseleave');
assert.equal(panel.inert, false);
const stalePage = window.__guestDrawer.refresh(2);
await window.__guestDrawer.refresh(3);
delayed();
await stalePage;
assert.equal(wall.children[0].dataset.id, '30');
assert.equal(navigation.children[2].attributes.get('aria-current'), 'page');
assert.equal(wall.scrollTop, 0);
assert.ok(ownershipRefreshes >= 2);
await window.__guestDrawer.refresh(1);
assert.equal(wall.children[0].dataset.id, '10');
document.documentElement.clientWidth = 1024;
form.rect.left = 48;
form.rect.right = 566;
mutation();
assert.equal(drawer.values.get('--guest-drawer-left'), '622px');
assert.equal(drawer.values.get('--guest-drawer-width'), '298px');
document.documentElement.clientWidth = 390;
form.rect.left = 24;
form.rect.right = 306;
mutation();
assert.equal(drawer.values.get('--guest-drawer-left'), '24px');
assert.equal(drawer.values.get('--guest-drawer-width'), '262px');
assert.equal(Number.parseFloat(drawer.values.get('--guest-drawer-left')) + Number.parseFloat(drawer.values.get('--guest-drawer-width')), 390 - 56 - 32 - 16);
assert.equal(drawer.values.get('--guest-drawer-trigger'), '294px');
for (const viewport of [320, 375, 390, 700]) {
  document.documentElement.clientWidth = viewport;
  const inset = Math.max(24, Math.min(48, viewport * 0.04));
  form.rect.left = inset;
  form.rect.right = viewport - inset - 60;
  mutation();
  const circleLeft = Number.parseFloat(drawer.values.get('--guest-drawer-left')) + Number.parseFloat(drawer.values.get('--guest-drawer-trigger'));
  assert.equal(circleLeft - form.rect.right, 12);
  assert.ok(circleLeft + 36 <= viewport - inset);
}
body.dataset.pagerActive = 'latest';
mutation();
assert.equal(panel.inert, true);
assert.equal(handle.attributes.get('aria-expanded'), 'false');
body.dataset.pagerActive = 'about';
mutation();
assert.equal(panel.inert, true, 'guest drawer stays collapsed when returning to Coda');
assert.match(css, /body\.has-pager:not\(\[data-pager-active="about"\]\) > \.guest-drawer \{\s*display: none;/);
assert.match(css, /\.guest-drawer-pages \{[^}]*flex-direction: column;[^}]*overflow-y: auto;/);
assert.match(css, /\.guest-drawer \.guest-wall \{[^}]*overflow-y: auto;/);
assert.match(css, /\.pager-page\[data-pager-page="about"\] \{\s*position: relative;\s*overflow: clip;/);
assert.match(css, /\.pager #about \.footer-guestbook \{\s*flex: 1;\s*min-height: 0;\s*overflow: clip;/);
assert.match(css, /\.guest-drawer-panel \{[^}]*background: var\(--black\);[^}]*color: var\(--white\);/);
assert.match(css, /\.guest-drawer \.guest-note \{\s*border: 1px solid rgba\(255, 255, 255, 0\.25\);\s*padding: 16px;/);
assert.match(css, /\.guest-drawer \.guest-note:last-child \{\s*margin-bottom: 0;\s*\}/);
assert.match(css, /\.guest-drawer-pages \{[^}]*border-left: 1px solid rgba\(255, 255, 255, 0\.25\);/);
assert.match(css, /\.guest-drawer-page:hover \{\s*color: var\(--white\);/);
const staticHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(staticHtml, /\.pager-page\[data-pager-page="about"\] \{\s*position: relative;\s*overflow: clip;/);
assert.match(staticHtml, /\.pager #about \.footer-guestbook \{\s*flex: 1;\s*min-height: 0;\s*overflow: clip;/);
const drawerStyles = css.slice(css.indexOf('.guest-drawer {'), css.indexOf('@media (min-width: 701px) and (max-width: 1200px)', css.indexOf('.guest-drawer {')));
assert.ok(staticHtml.includes(drawerStyles), 'static homepage keeps matching guest drawer styles');
// 投稿：原样式逐字迁自页脚（竖排宋体+悬停左划线），只把颜色改成黑、钉在右侧竖轨顶部
assert.match(css, /\.footer-submit \{[^}]*position: absolute;[^}]*top: 0;[^}]*left: 50%;[^}]*writing-mode: vertical-rl;[^}]*text-orientation: upright;[^}]*font-family: serif;[^}]*font-size: 22px;[^}]*line-height: 1;[^}]*color: var\(--black\);[^}]*padding: 20px 0;/);
assert.match(css, /\.footer-submit::after \{[^}]*left: -4px;[^}]*width: 1px;[^}]*background: currentColor;[^}]*opacity: 0;/);
assert.match(css, /\.footer-submit:hover::after,\n\.footer-submit:focus-visible::after \{\s*opacity: 1;/);
assert.ok(!css.includes('.guest-drawer-submit'), 'submit is not in the guest drawer panel');
assert.ok(!css.includes('.footer-social-submit'), 'no invented submit styling');
assert.ok(!css.includes('.footer-links'), 'old footer links styles are gone');
assert.match(css, /\.guest-drawer-handle \{[^}]*width: 36px;[^}]*height: 36px;[^}]*place-items: center;[^}]*border: 1px solid currentColor;[^}]*border-radius: 50%;/);
assert.match(css, /\.guest-drawer-handle \{[^}]*color: var\(--gray-4\);[^}]*pointer-events: auto;[^}]*transition: color 360ms ease;/);
assert.match(css, /\.guest-drawer\.is-open \.guest-drawer-handle \{\s*color: var\(--black\);\s*\}/);
assert.doesNotMatch(css.match(/\.guest-drawer-handle \{[^}]*\}/)[0], /mix-blend-mode:/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.guest-drawer-panel,\s*\.guest-drawer-handle \{\s*transition: none;/);
assert.match(css, /\.guest-drawer::after \{[^}]*left: 100%;[^}]*width: max\(0px, calc\(var\(--guest-drawer-trigger, -44px\) \+ 36px - 100%\)\);[^}]*pointer-events: auto;/);
assert.match(css, /@media \(max-width: 700px\) \{\s*\.pager #about \.footer-guestbook-inner \{\s*width: calc\(100% - 60px\);/);
assert.ok(!css.includes('.submit-drawer'));
assert.ok(!source.includes('.submit-drawer'));
for (const html of [staticHtml, readFileSync(new URL('../server/views/index.ejs', import.meta.url), 'utf8')]) {
  // 投稿原样（id="submit"）挂在右侧竖轨顶部：在 .cadenza-rail 开标签之后、社交内容之前；全页恰一个 mailto
  assert.equal((html.match(/mailto:/g) || []).length, 1);
  assert.ok(html.indexOf('id="submit"') > html.indexOf('class="cadenza-rail"'));
  assert.ok(html.indexOf('id="submit"') < html.indexOf('class="cadenza-rail-social"'), 'submit pinned at the very top of the rail, page top-right');
  assert.ok(!html.includes('class="footer-links"'), 'footer links row removed from markup');
  assert.ok(!html.includes('submit-drawer'));
  assert.ok(html.includes('viewBox="0 0 16 16"'));
  assert.ok(html.includes('d="M5 3L11 8L5 13"'));
  assert.ok(html.includes('class="cadenza-rail"'), 'existing social drawer is preserved');
}
console.log('PASS: centered circular guestbook trigger, 12px form clearance including narrow screens, black submit entry atop the right social rail, removed submission drawer, preserved social drawer, scrolling/pagination and hover/pinning/focus/Escape');
