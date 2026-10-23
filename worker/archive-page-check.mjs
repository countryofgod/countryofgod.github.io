import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const source = readFileSync(new URL('public/js/site.js', root), 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.paused = true;
    this.error = null;
    this.value = '';
    this.style = { setProperty() {} };
    this.currentTime = 0;
    this.duration = NaN;
  }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.append(child); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  dispatch(name) { this.listeners.get(name)?.(); }
  play() {
    if (this.rejectPlayback) return Promise.reject(new Error('Unavailable'));
    this.paused = false;
    this.dispatch('play');
    return Promise.resolve();
  }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.dispatch('pause');
  }
  load() { this.error = null; }
}

const descendants = (element) => [element, ...element.children.flatMap(descendants)];
const find = (element, className) => descendants(element).find((child) => child.className?.split(' ').includes(className));

function setup(category) {
  const container = new Element('div');
  const document = {
    title: '',
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => descendants(container).filter((element) => element.tagName === 'audio'),
  };
  const context = vm.createContext({ document, location: { pathname: '/d/2026-10-15/' + category } });
  const parsers = source.slice(source.indexOf('const splitDaily ='), source.indexOf('const dailyGrid ='));
  const renderers = source.slice(source.indexOf('function renderDailyTextPage('), source.indexOf('/* ---------- 右侧章节导航'));
  vm.runInContext(parsers + '\n' + renderers, context);
  return { container, context, document };
}

for (const filename of readdirSync(new URL('daily/pub/', root)).filter((name) => name.endsWith('.txt'))) {
  const { container, context } = setup('pub');
  const text = readFileSync(new URL('daily/pub/' + filename, root), 'utf8');
  const lines = text.replace(/^\uFEFF/, '').trimStart().split(/\r?\n/);
  context.renderDailyTextPage(container, text, 'pub');
  assert.equal(find(container, 'sheet-title').textContent, lines[0]);
  assert.equal(find(container, 'sheet-author').textContent, lines[1]);
  assert.equal(find(container, 'sheet-body').textContent.replace(/\s/g, ''), lines.slice(3).join('').replace(/\s/g, ''));
  assert.ok(find(container, 'sheet-body').className.includes('is-prose'));
}

for (const category of ['article', 'poem']) {
  const directory = new URL('daily/' + category + '/', root);
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.txt'))) {
    const { container, context } = setup(category);
    const text = readFileSync(new URL(file, directory), 'utf8');
    context.renderDailyTextPage(container, text, category);
    const lines = text.trim().split(/\r?\n/);
    assert.equal(find(container, 'sheet-title').textContent, lines[0]);
    assert.equal(find(container, 'sheet-author').textContent, lines[1]);
    assert.equal(find(container, 'sheet-body').textContent.includes(lines[1]), false);
    assert.equal(find(container, 'sheet-body').className.includes('is-prose'), category === 'article');
  }
}

{
  const { container, context } = setup('article');
  context.renderDailyTextPage(container, '<标题>\n正文没有署名\n\n第二段', 'article');
  assert.equal(find(container, 'sheet-author'), undefined);
  assert.match(find(container, 'sheet-body').textContent, /正文没有署名/);
  assert.equal(find(container, 'sheet-title').textContent, '<标题>');
}

for (const file of readdirSync(new URL('daily/music/', root)).filter((name) => name.endsWith('.txt'))) {
  const { container, context } = setup('music');
  const imageSrc = '/daily/music/' + file.replace(/\.txt$/, '.jpg');
  context.renderDailyMusicPage(container, readFileSync(new URL('daily/music/' + file, root), 'utf8'), imageSrc);
  const artwork = find(container, 'daily-music-art');
  assert.equal(artwork.children[0].src, imageSrc);
  assert.ok(readFileSync(new URL('.' + imageSrc, root)).length > 0);
  assert.ok(container.children.indexOf(artwork) < container.children.indexOf(find(container, 'daily-tracklist')));
  artwork.children[0].dispatch('error');
  assert.equal(artwork.hidden, true);
  const audio = descendants(container).find((element) => element.tagName === 'audio');
  assert.equal(audio.controls, false);
  assert.equal(audio.hidden, true);
  assert.equal(audio.preload, 'metadata');
  const mediaPath = new URL('.' + audio.src, root);
  assert.ok(readFileSync(mediaPath).length > 0, fileURLToPath(mediaPath));
  const button = find(container, 'daily-track-play');
  button.dispatch('click');
  assert.equal(button.attributes.get('data-state'), 'playing');
  assert.equal(button.attributes.get('aria-pressed'), 'true');
  button.dispatch('click');
  assert.equal(audio.paused, true);
  audio.dispatch('error');
  assert.equal(button.attributes.get('data-state'), 'error');
  audio.rejectPlayback = true;
  button.dispatch('click');
  await Promise.resolve();
  assert.equal(button.attributes.get('data-state'), 'error');
  assert.equal(button.textContent, '');
  assert.equal(find(container, 'daily-track-status'), undefined);
  assert.equal(container.textContent.includes('点击播放，可拖动进度条。'), false);
  const seek = find(container, 'daily-player-seek');
  assert.equal(seek.disabled, true);
  audio.duration = 200;
  audio.dispatch('loadedmetadata');
  assert.equal(seek.disabled, false);
  seek.value = '250';
  seek.dispatch('input');
  assert.equal(audio.currentTime, 50);
  assert.equal(find(container, 'daily-player-time').textContent, '00:50 / 03:20');
  audio.duration = Infinity;
  audio.dispatch('durationchange');
  assert.equal(seek.disabled, true);
  assert.equal(container.children.filter((element) => element.className === 'sheet-heading').length, 1);
}

{
  const { container, context } = setup('music');
  context.renderDailyMusicPage(container, '歌单\n\n第一曲|/one.mp3\n作者一\n\n第二曲|/two.mp3\n作者二');
  const players = descendants(container).filter((element) => element.tagName === 'audio');
  await players[0].play();
  await players[1].play();
  assert.equal(players[0].paused, true);
  assert.equal(players[1].paused, false);
  context.renderDailyMusicPage(container, '空歌单');
  assert.match(container.textContent, /歌单为空/);
}

console.log('PASS: pub submissions, 10 archived texts, 3 music sources, author alignment structure, poetry/prose, playback controls, pause, errors, exclusive playback and empty playlists');
