import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const pagerSource = readFileSync(new URL('public/js/pager.js', root), 'utf8');
const siteSource = readFileSync(new URL('public/js/site.js', root), 'utf8');
const css = readFileSync(new URL('public/css/site.css', root), 'utf8');

class Element {
  constructor(className = '', id = '') {
    this.className = className;
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classes = new Set(className.split(' ').filter(Boolean));
    this.classList = {
      contains: (name) => this.classes.has(name),
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      toggle: (name, force = !this.classes.has(name)) => {
        if (force) this.classes.add(name);
        else this.classes.delete(name);
        return force;
      },
    };
    this.styleValues = new Map();
    this.style = {
      removeProperty: (name) => this.styleValues.delete(name),
      setProperty: (name, value) => this.styleValues.set(name, value),
    };
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.offsetHeight = 200;
    this.offsetWidth = 1440;
  }
  appendChild(child) {
    if (child.parentElement) {
      child.parentElement.children = child.parentElement.children.filter((item) => item !== child);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    return selector.replace(/^a/, '').split('.').filter(Boolean).every((name) =>
      this.classes.has(name) || this.className.split(' ').includes(name));
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector) || null;
  }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  dispatch(name, event = {}) { this.listeners.get(name)?.(event); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name) || null; }
  getBoundingClientRect() { return { top: this.top || 0 }; }
  scrollTo(options) { this.scrollTop = options.top; }
}

function setup(hash = '') {
  const body = new Element();
  const pager = body.appendChild(new Element('pager'));
  const track = pager.appendChild(new Element('pager-track'));
  const pages = ['top', 'daily', 'latest', 'archive', 'museum', 'about'].map((id) => {
    const page = track.appendChild(new Element('pager-page', id));
    page.dataset.pagerPage = id;
    return page;
  });
  const list = pages[2].appendChild(new Element('article-list'));
  list.getBoundingClientRect = () => ({ top: 280 - pages[2].scrollTop });
  const toc = list.appendChild(new Element('pub-toc'));
  const handle = toc.appendChild(new Element('pub-toc-handle'));
  const tocList = toc.appendChild(new Element('pub-toc-list'));
  const nextBtn = list.appendChild(new Element('pub-next'));
  const articles = ['First', 'Second'].map((title) => {
    const article = list.appendChild(new Element('article-item'));
    article.appendChild(new Element('article-title')).textContent = title;
    return article;
  });
  const nav = body.appendChild(new Element('side-nav'));
  const footerBottom = pages[5].appendChild(new Element('footer-bottom'));
  const document = {
    body,
    querySelector(selector) {
      if (selector === '[data-pager]') return pager;
      if (selector.startsWith('#latest ')) return pages[2].querySelector(selector.slice(8));
      if (selector === '#about .footer-bottom') return footerBottom;
      return body.querySelector(selector);
    },
    createElement: () => new Element(),
    getElementById: (id) => body.querySelector('#' + id),
  };
  pager.querySelector = () => track;
  const events = new Map();
  const historyEntries = [];
  const location = { hash };
  const history = {
    pushState(state, title, url) {
      historyEntries.push({ state, url });
      location.hash = url;
    },
  };
  const window = {
    addEventListener: (name, handler) => events.set(name, handler),
    setTimeout: (handler) => { handler(); return 1; },
    clearTimeout() {},
    __sideNavSetActive: (id) => { nav.activeId = id; },
  };
  const context = vm.createContext({
    document, window, location, history, requestAnimationFrame: (handler) => handler(),
    getComputedStyle: () => ({ paddingTop: '16px', paddingBottom: '0px' }),
  });
  vm.runInContext(pagerSource, context);
  const clickNav = (id) => {
    const link = new Element('side-nav-item');
    link.setAttribute('href', '#' + id);
    let prevented = false;
    nav.dispatch('click', { target: link, preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  };
  return { body, track, pages, toc, handle, tocList, nextBtn, articles, events, location, historyEntries, nav, context, clickNav, footerBottom };
}

{
  const app = setup('#museum');
  assert.equal(app.nav.activeId, 'museum');
  const pubControls = app.track.querySelector('.pager-pub-controls');
  assert.equal(pubControls.parentElement, app.track);
  assert.equal(pubControls.style.left, '200%');
  assert.equal(app.toc.parentElement, pubControls);
  assert.equal(app.footerBottom.parentElement, app.pages[5]);
  assert.equal(app.pages[2].querySelector('.pub-toc'), null);
  assert.equal(app.nextBtn.parentElement, pubControls);
  assert.equal(app.pages[2].querySelector('.pub-next'), null);
  app.pages[2].scrollTop = 1800;
  for (const id of ['about', 'latest', 'daily', 'archive', 'museum', 'top']) {
    app.clickNav(id);
    assert.equal(app.location.hash, '#' + id);
    assert.equal(app.body.dataset.pagerActive, id);
    assert.equal(app.nav.activeId, id);
    assert.equal(app.footerBottom.parentElement, app.pages[5]);
    assert.equal(app.footerBottom.parentElement.parentElement, app.track);
    assert.equal(app.toc.parentElement.parentElement, app.track);
    assert.equal(app.nextBtn.parentElement.parentElement, app.track);
    assert.equal(app.track.style.transform, 'translateX(' + (-app.pages.findIndex((page) => page.id === id) * 100) + '%)');
  }
  app.clickNav('top');
  assert.equal(app.historyEntries.length, 6);
  assert.equal(app.pages[2].scrollTop, 1800);
  app.location.hash = '#about';
  app.events.get('popstate')();
  assert.equal(app.body.dataset.pagerActive, 'about');
  app.location.hash = '';
  app.events.get('popstate')();
  assert.equal(app.body.dataset.pagerActive, 'top');
  app.location.hash = '#latest';
  app.events.get('hashchange')();
  assert.equal(app.body.dataset.pagerActive, 'latest');
  app.location.hash = '#ipod-music';
  app.events.get('popstate')();
  assert.equal(app.body.dataset.pagerActive, 'daily');
  app.location.hash = '#unknown';
  app.events.get('hashchange')();
  assert.equal(app.body.dataset.pagerActive, 'daily');
  app.pages[2].scrollLeft = 30;
  app.events.get('resize')();
  assert.equal(app.pages[2].scrollLeft, 0);
  assert.equal(app.pages[2].scrollTop, 1800);
}

for (const id of ['top', 'daily', 'latest', 'archive', 'museum', 'about']) {
  const app = setup('#' + id);
  assert.equal(app.body.dataset.pagerActive, id);
  assert.equal(app.footerBottom.parentElement, app.pages[5]);
}
assert.equal(setup().body.dataset.pagerActive, 'top');

{
  const app = setup('#latest');
  app.pages[2].scrollTop = 1800;
  app.articles[0].classList.add('expanded');
  const initSource = siteSource.slice(siteSource.indexOf('function initPubToc()'), siteSource.indexOf('pubCardsReady.then(initPubToc)'));
  vm.runInContext(initSource + '\ninitPubToc();', app.context);
  assert.equal(app.toc.styleValues.get('--pub-toc-top'), '280px');
  assert.equal(app.toc.styleValues.get('--pub-toc-height'), '216px');
  assert.equal(app.articles[0].classList.contains('expanded'), true);
  app.pages[2].scrollTop = 2400;
  app.events.get('resize')();
  assert.equal(app.toc.styleValues.get('--pub-toc-top'), '280px');
  assert.equal(app.toc.styleValues.get('--pub-toc-height'), '216px');
  assert.equal(app.toc.classList.contains('is-positioned'), true);
  assert.equal(app.nextBtn.styleValues.get('--pub-toc-top'), '280px');
  assert.equal(app.nextBtn.styleValues.get('--pub-toc-height'), '216px');
  assert.equal(app.nextBtn.classList.contains('is-positioned'), true);
  assert.equal(app.tocList.children.length, 2);
  app.handle.dispatch('click');
  assert.equal(app.handle.getAttribute('aria-expanded'), 'true');
  app.tocList.children[1].children[0].dispatch('click', { preventDefault() {} });
  assert.equal(app.articles[1].classList.contains('is-active'), true);
  assert.equal(app.articles[0].classList.contains('is-hidden'), true);
  app.nextBtn.dispatch('click');
  assert.equal(app.articles[0].classList.contains('is-active'), true);
  assert.equal(app.articles[1].classList.contains('is-hidden'), true);
  app.handle.dispatch('click');
  assert.equal(app.handle.getAttribute('aria-expanded'), 'false');
  app.pages[2].top = 0;
  app.articles[1].top = 300;
  app.pages[2].scrollTop = 1800;
  assert.equal(app.context.window.__pagerScrollPageOf(app.articles[1], 'instant'), true);
  assert.equal(app.pages[2].scrollTop, 2100);
}

{
  const app = setup('#latest');
  const page = app.pages[2];
  page.clientHeight = 800;
  page.scrollHeight = 2536;
  const heights = [2000, 400];
  app.articles.forEach((article, index) => {
    article.getBoundingClientRect = () => ({
      bottom: 296 - page.scrollTop + heights[index],
    });
  });
  app.articles[0].classList.add('is-active');
  const frames = [];
  const observers = [];
  app.context.requestAnimationFrame = (handler) => { frames.push(handler); return frames.length; };
  app.context.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe() {}
  };
  app.context.ResizeObserver = app.context.MutationObserver;
  const flush = () => { while (frames.length) frames.shift()(); };
  const refresh = () => { observers[0].callback(); flush(); };
  const scroll = (top) => { page.scrollTop = top; page.dispatch('scroll'); flush(); };
  const progressSource = siteSource.slice(siteSource.indexOf('function initPubProgress()'),
    siteSource.indexOf('pubCardsReady.then(initPubProgress)'));
  vm.runInContext(progressSource + '\ninitPubProgress();', app.context);
  const indicator = app.toc.querySelector('.pub-progress');
  const bars = indicator.children;
  const width = (index) => Number.parseFloat(bars[index].styleValues.get('--pub-progress-width'));
  const current = () => bars.findIndex((bar) => bar.classList.contains('is-current'));
  assert.equal(indicator.parentElement, app.toc);
  assert.equal(bars.length, 9);
  assert.equal(indicator.getAttribute('aria-hidden'), 'true');
  assert.equal(indicator.classList.contains('is-visible'), true);
  assert.equal(indicator.classList.contains('is-expanded'), false);
  assert.equal(current(), 0, 'collapsed articles highlight the top square');
  assert.equal(page.querySelector('.pub-position'), null);
  app.articles[0].classList.add('expanded');
  refresh();
  assert.equal(indicator.classList.contains('is-visible'), true);
  assert.equal(indicator.classList.contains('is-expanded'), true);
  assert.equal(current(), 0);
  assert.equal(width(0), 32);
  scroll(0.01);
  assert.ok(width(0) < 32, 'the first fractional scroll changes the bars immediately');
  assert.ok(width(1) > 21.5);
  scroll(748);
  assert.equal(current(), 4);
  assert.equal(width(4), 32);
  assert.equal(width(3), 21.5);
  assert.equal(width(2), 14);
  assert.equal(width(1), 9.5);
  assert.equal(width(0), 8);
  for (let distance = 1; distance <= 4; distance += 1) {
    assert.equal(width(4 - distance), width(4 + distance));
  }
  scroll(1496);
  assert.equal(current(), 8, 'the article bottom always selects the ninth bar');
  assert.equal(width(8), 32);
  scroll(1736);
  assert.equal(current(), 8, 'bottom padding preserves the final position');
  app.toc.classList.add('is-open');
  scroll(748);
  assert.equal(current(), 4, 'the current dot still updates while the directory is open');
  app.toc.classList.remove('is-open');
  app.articles[0].classList.add('is-leaving');
  refresh();
  assert.equal(indicator.classList.contains('is-visible'), false);
  app.articles[0].classList.remove('is-active', 'expanded', 'is-leaving');
  app.articles[1].classList.add('is-active', 'expanded');
  page.scrollHeight = 936;
  scroll(0.01);
  assert.ok(width(0) < 32, 'short articles also respond immediately');
  scroll(136);
  assert.equal(current(), 8);
  app.articles[1].classList.remove('expanded');
  refresh();
  assert.equal(indicator.classList.contains('is-visible'), true);
  assert.equal(indicator.classList.contains('is-expanded'), false);
  assert.equal(current(), 0, 'collapsing at the bottom resets the highlight to the top square');
  scroll(100);
  assert.equal(current(), 0, 'scrolling a collapsed article keeps the top square highlighted');
  app.articles[1].classList.add('expanded');
  scroll(136);
  assert.equal(current(), 8);
  assert.equal(indicator.classList.contains('is-expanded'), true);
  page.clientHeight = 600;
  observers[1].callback();
  flush();
  assert.equal(current(), 8);
  page.scrollHeight = page.clientHeight = 800;
  scroll(0);
  assert.equal(current(), 0);
  assert.ok(bars.every((bar, index) => Number.isFinite(width(index))));
  app.articles[1].classList.remove('expanded');
  refresh();
  assert.equal(indicator.classList.contains('is-visible'), true);
  assert.equal(indicator.classList.contains('is-expanded'), false);
  assert.equal(current(), 0);
}

assert.doesNotMatch(siteSource + css, /pub-position|initPubPosition/);
assert.match(css, /\.pub-progress \{[^}]*right: 30px;[^}]*align-items: flex-end;/);
assert.match(css, /\.pub-progress-bar \{[^}]*height: 3px;[^}]*border-radius: 0;[^}]*transition: width/);
assert.match(css, /\.pub-progress-bar.is-current \{\s*background: #000;/);
assert.match(css, /\.pub-progress:not\(\.is-expanded\) \.pub-progress-bar \{\s*width: 3px;\s*background: transparent;\s*border-color: #b8b8b8;/);
assert.match(css, /\.pub-progress:not\(\.is-expanded\) \.pub-progress-bar.is-current \{\s*background: #000;\s*border-color: #000;/);
assert.match(css, /\.pub-toc:hover \.pub-progress-bar,\s*\.pub-toc.is-open \.pub-progress-bar \{\s*width: 3px;/);

assert.match(css, /body\.has-pager:not\(\[data-pager-active="about"\]\) \.cadenza-rail \{\s*display: none;/);
assert.doesNotMatch(css, /body\.has-pager:not\(\[data-pager-active="latest"\]\) \.pub-(?:toc|next)/);
assert.match(css, /\.pager-pub-controls \{\s*position: absolute;[^}]*overflow: hidden;[^}]*pointer-events: none;/);
assert.match(css, /body\.has-pager \.pub-toc \{\s*position: absolute;/);
assert.match(css, /body\.has-pager \.pub-toc \{[^}]*top: var\(--pub-toc-top\);[^}]*height: var\(--pub-toc-height\);/);
assert.match(css, /body\.has-pager \.pub-next \{\s*position: absolute;[^}]*top: calc\(var\(--pub-toc-top\) \+ var\(--pub-toc-height\) \/ 2\);[^}]*right: calc\(\(100% - var\(--page-w\)\) \/ 2\);[^}]*width: 26px;/);
assert.match(css, /body\.has-pager \.pub-toc-panel \{[^}]*top: 0;[^}]*max-height: calc\(100dvh - var\(--pub-toc-top\) - 32px\);[^}]*overflow-y: auto;/);
assert.match(css, /\.side-nav-item\[data-label\]::after \{[^}]*font-family: var\(--font-body\);[^}]*writing-mode: vertical-rl;[^}]*text-orientation: upright;/);
const staticHtml = readFileSync(new URL('index.html', root), 'utf8');
for (const selector of ['.pub-progress', '.pub-progress.is-visible', '.pub-progress-bar', '.pub-progress-bar.is-current', '.pub-progress:not(.is-expanded) .pub-progress-bar', '.pub-progress:not(.is-expanded) .pub-progress-bar.is-current', '.pub-toc.is-open .pub-progress-bar', '.pub-toc-panel', '.pager-track', '.pager-pub-controls', 'body.has-pager .pub-toc', 'body.has-pager .pub-next', 'body.has-pager .pub-toc-panel', '.side-nav-item[data-label]::after']) {
  const cssRule = css.slice(css.indexOf(selector + ' {')).split('}')[0] + '}';
  assert.ok(staticHtml.includes(cssRule), selector + ' stays synchronized');
}

const articleCss = readFileSync(new URL('public/css/article.css', root), 'utf8');
assert.match(articleCss, /\.sheet-body \{\s*font-family: serif;/);
assert.match(css, /body\.has-pager \.pager-page\[data-pager-page="about"\] > \.footer-bottom \{\s*position: absolute;[^}]*right:[^}]*bottom:/);
assert.doesNotMatch(css, /body\.has-pager:not\(\[data-pager-active="about"\]\) > \.footer-bottom/);
assert.match(css, /\.pager-page\[data-pager-page="about"\] \{\s*position: relative;\s*overflow: clip;/);
assert.match(css, /\.pager #about \.footer-guestbook \{[^}]*min-height: 0;[^}]*overflow: clip;/);
assert.match(articleCss, /\.echo-form\[hidden\] \{\s*display: none;/);

console.log('PASS: chapter hashes, deep links, history, iPod return, collapsed-article TOC anchor preserved during scrolling and resize, article switching, Coda-only drawer, vertical homepage-font labels and serif article body');
