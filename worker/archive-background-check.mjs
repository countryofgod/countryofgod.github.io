import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('public/js/archive-background.js', root), 'utf8');
const css = readFileSync(new URL('public/css/site.css', root), 'utf8');
const frames = [];
const windowEvents = new Map();
const scrollEvents = new Map();
const transitions = new Map();
const observed = [];
let resize;
let image;
const page = {
  clientWidth: 1200, clientHeight: 800,
  rect: { left: 3600, top: 0 },
  getBoundingClientRect() { return this.rect; },
  addEventListener: (name, callback) => scrollEvents.set(name, callback),
};
function element(left, top) {
  const values = new Map();
  return {
    rect: { left, top },
    values,
    style: { setProperty: (name, value) => values.set(name, value) },
    getBoundingClientRect() { return this.rect; },
  };
}
const year = element(3768, 280);
const months = element(3768, 360);
const archive = element(3600, 0);
archive.clientTop = 2;
archive.clientLeft = 0;
archive.closest = () => page;
archive.querySelectorAll = () => [year, months];
archive.classes = new Set();
archive.classList = { add: (name) => archive.classes.add(name) };
archive.addEventListener = (name, callback) => transitions.set(name, callback);
const context = {
  document: { querySelector: () => archive },
  window: {
    ResizeObserver: true,
    addEventListener: (name, callback) => windowEvents.set(name, callback),
  },
  requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; },
  ResizeObserver: class {
    constructor(callback) { resize = callback; }
    observe(target) { observed.push(target); }
  },
  getComputedStyle: () => ({ backgroundImage: 'url("http://localhost/img/archive.webp")' }),
  Image: class {
    constructor() { image = this; this.naturalWidth = 0; this.naturalHeight = 0; }
    addEventListener(name, callback) { this.onLoad = callback; }
  },
};
vm.runInNewContext(source, context);
assert.equal(image.src, 'http://localhost/img/archive.webp');
assert.equal(frames.length, 0);
image.naturalWidth = 1600;
image.naturalHeight = 900;
image.onLoad();
function flush() {
  assert.ok(frames.length);
  frames.shift()();
}
function checkAlignment() {
  const size = archive.values.get('--archive-bg-size').split(' ').map(Number.parseFloat);
  assert.ok(size[0] >= page.clientWidth && size[1] >= page.clientHeight);
  for (const target of [archive, year, months]) {
    const position = target.values.get('--archive-bg-position').split(' ').map(Number.parseFloat);
    const inset = target === archive ? archive.clientTop : 0;
    assert.ok(Math.abs(position[0] + target.rect.left - page.rect.left - (page.clientWidth - size[0]) / 2) < 0.0001);
    assert.ok(Math.abs(position[1] + target.rect.top + inset - page.rect.top - (page.clientHeight - size[1]) / 2) < 0.0001);
  }
}
flush();
assert.ok(archive.classes.has('has-aligned-background'));
checkAlignment();
assert.deepEqual(observed, [page, archive, year, months]);

for (const target of [archive, year, months]) target.rect.top -= 250;
scrollEvents.get('scroll')();
scrollEvents.get('scroll')();
assert.equal(frames.length, 1);
flush();
checkAlignment();

page.rect.left = 0;
archive.rect.left = 0;
year.rect.left = 168;
months.rect.left = 168;
resize();
flush();
checkAlignment();

transitions.get('transitionrun')({ target: archive, propertyName: 'grid-template-rows' });
months.rect.top += 45;
flush();
checkAlignment();
assert.equal(frames.length, 1);
transitions.get('transitionrun')({ target: months, propertyName: 'grid-template-rows' });
transitions.get('transitionend')({ target: archive, propertyName: 'grid-template-rows' });
flush();
assert.equal(frames.length, 1);
transitions.get('transitioncancel')({ target: months, propertyName: 'grid-template-rows' });
flush();
assert.equal(frames.length, 0);
transitions.get('transitionrun')({ target: year, propertyName: 'color' });
assert.equal(frames.length, 0);

page.clientWidth = 390;
page.clientHeight = 844;
year.rect.left = 24;
months.rect.left = 24;
windowEvents.get('resize')();
flush();
checkAlignment();
assert.equal(frames.length, 0);
assert.match(css, /\.pager \.archive\.has-aligned-background::before,[\s\S]*?background-attachment: scroll;\s*background-origin: border-box;\s*background-size: var\(--archive-bg-size\);\s*background-position: var\(--archive-bg-position\);/);
const staticHtml = readFileSync(new URL('index.html', root), 'utf8');
const alignmentStyles = css.slice(css.indexOf('.pager .archive.has-aligned-background::before'), css.indexOf('/* 反色条原本', css.indexOf('.pager .archive.has-aligned-background::before')));
assert.ok(staticHtml.includes(alignmentStyles));
for (const path of ['index.html', 'server/views/index.ejs']) {
  const html = readFileSync(new URL(path, root), 'utf8');
  assert.ok(html.indexOf('js/archive-background.js?') > html.indexOf('js/pager.js?'));
}
vm.runInNewContext(source, { document: { querySelector: () => null } });
console.log('PASS: one shared archive image across backdrop/year/month windows, borders, scrolling, horizontal transitions, expansion/cancellation, resize and mobile; no idle animation loop');
