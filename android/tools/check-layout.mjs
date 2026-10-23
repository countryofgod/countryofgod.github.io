import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { connect } from './webview.mjs';

const client = await connect(Number(process.env.WEBVIEW_PORT || 9222));
const evaluate = client.evaluate;
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const output = new URL('../.toolchain/layout-check/', import.meta.url);
await mkdir(output, { recursive: true });
const ids = ['top', 'daily', 'latest', 'archive', 'museum', 'about'];
const goTo = async id => {
  await evaluate(`document.querySelector('.android-nav-toggle').click(); document.querySelector('.side-nav-item[href="#${id}"]').click()`);
  await pause(900);
  assert.equal(await evaluate('document.body.dataset.pagerActive'), id);
  assert.equal(await evaluate('document.body.classList.contains("android-nav-open")'), false);
};
const capture = async name => {
  const result = await client.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(new URL(name + '.png', output), Buffer.from(result.data, 'base64'));
};

try {
  assert.equal(await evaluate('Boolean(window.__androidShell)'), true);
  assert.equal(await evaluate('document.querySelectorAll(".side-nav-item").length'), 6);
  const original = await evaluate('({width:innerWidth,height:innerHeight})');
  for (const [width, height] of [[360, 720], [320, 640], [412, 915], [800, 360]]) {
    await client.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 3, mobile: true });
    await pause(250);
    for (const id of ids) {
      await goTo(id);
      const geometry = await evaluate(`(() => {
        const page = document.querySelector('[data-pager-page="${id}"]');
        const toggle = document.querySelector('.android-nav-toggle').getBoundingClientRect();
        return {width:page.clientWidth, height:page.clientHeight, scrollWidth:page.scrollWidth,
          viewport:document.documentElement.clientWidth, screenHeight:innerHeight,
          toggle:{left:toggle.left,right:toggle.right,top:toggle.top,bottom:toggle.bottom}};
      })()`);
      assert.equal(geometry.width, width, `${id}: page width`);
      assert.ok(geometry.scrollWidth <= width + 1, `${id}: horizontal overflow`);
      assert.ok(geometry.toggle.left >= 0 && geometry.toggle.right <= width, `${id}: menu x`);
      assert.ok(geometry.toggle.top >= 0 && geometry.toggle.bottom <= height, `${id}: menu y`);
      const safe = await evaluate(`(() => {
        const page=document.querySelector('[data-pager-page="${id}"]');
        return [...page.querySelectorAll('input:not([type="file"]),textarea,.guest-submit,.daily-ipod,.section-title')]
          .filter(element=>element.getClientRects().length).every(element=>{
            const rect=element.getBoundingClientRect(); return rect.left>=-1 && rect.right<=innerWidth+1;
          });
      })()`);
      assert.equal(safe, true, `${id}: clipped controls/title`);
      if (id === 'museum') {
        assert.equal(await evaluate(`(() => {
          return [...document.querySelectorAll('.museum-card:not(.museum-card--clone) .museum-poster')]
            .every(poster => poster.getBoundingClientRect().height > 0);
        })()`), true, `${width}×${height}: museum posters visible`);
      }
      if (id === 'museum' && width <= 768) {
        const intro = await evaluate(`(() => {
          const batch = document.querySelector('.museum-intro-batch');
          const title = document.querySelector('.museum-inner .section-title').getBoundingClientRect();
          const batchRect = batch.getBoundingClientRect();
          const cards = [...document.querySelectorAll('.museum-card:not(.museum-card--clone)')];
          const cardsRect = cards.reduce((bounds, card) => {
            const rect = card.getBoundingClientRect();
            bounds.top = Math.min(bounds.top, rect.top);
            bounds.bottom = Math.max(bounds.bottom, rect.bottom);
            return bounds;
          }, {top: Infinity, bottom: -Infinity});
          return {position: getComputedStyle(batch).position,
            writingMode: getComputedStyle(batch).writingMode,
            batch:{top:batchRect.top,bottom:batchRect.bottom},
            title:{top:title.top,bottom:title.bottom}, cards:cardsRect};
        })()`);
        assert.equal(intro.position, 'static', `${width}: museum intro in document flow`);
        assert.equal(intro.writingMode, 'horizontal-tb', `${width}: museum intro horizontal`);
        assert.ok(intro.batch.top >= intro.title.bottom, `${width}: museum intro clears title`);
        assert.ok(intro.batch.top >= intro.cards.bottom, `${width}: museum intro clears cards`);
      }
      if (width === 360) await capture(id);
    }
    await evaluate(`document.querySelector('.android-nav-toggle').click()`);
    const menu = await evaluate(`(() => {
      const list = document.querySelector('.side-nav-list');
      const rect = list.getBoundingClientRect();
      list.scrollTop = list.scrollHeight;
      const last = list.querySelector('li:last-child a').getBoundingClientRect();
      return {left:rect.left, right:rect.right, top:rect.top, bottom:rect.bottom,
        lastBottom:last.bottom, visible:getComputedStyle(list).visibility};
    })()`);
    assert.equal(menu.visible, 'visible');
    assert.ok(menu.left >= 0 && menu.right <= width, `${width}×${height}: menu panel x`);
    assert.ok(menu.top >= 0 && menu.bottom <= height, `${width}×${height}: menu panel y`);
    assert.ok(menu.lastBottom <= menu.bottom + 1, `${width}×${height}: last menu item reachable`);
    assert.equal(await evaluate('window.__androidShell.back()'), true);
    console.log(`PASS: six pages at ${width}×${height}`);
  }
  await client.send('Emulation.clearDeviceMetricsOverride');
  await pause(300);
  for (const id of ids) {
    await goTo(id);
    await capture('native-' + id);
  }
  await goTo('latest');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pub-next')).display !== 'none'`), true);
  await evaluate(`document.querySelector('.pub-toc-handle').click()`);
  assert.equal(await evaluate(`document.querySelector('.pub-toc').classList.contains('is-open')`), true);
  assert.equal(await evaluate('window.__androidShell.back()'), true);
  await evaluate(`document.querySelector('.article-toggle')?.click()`);
  await pause(600);
  const position = await evaluate(`(() => {const page=document.querySelector('[data-pager-page="latest"]'); page.scrollTop=160; return page.scrollTop})()`);
  await goTo('daily');
  const audioState = await evaluate(`({view:document.querySelector('.daily-ipod-view:not([hidden])')?.dataset.ipodView, source:document.querySelector('audio').currentSrc})`);
  await goTo('latest');
  assert.equal(await evaluate(`document.querySelector('[data-pager-page="latest"]').scrollTop`), position);
  assert.equal(await evaluate(`window.__androidShell.canRefresh(100,200)`), position === 0);
  await goTo('daily');
  assert.deepEqual(await evaluate(`({view:document.querySelector('.daily-ipod-view:not([hidden])')?.dataset.ipodView, source:document.querySelector('audio').currentSrc})`), audioState);
  await goTo('about');
  await evaluate(`document.querySelector('.guest-drawer-handle').click()`);
  assert.equal(await evaluate(`document.querySelector('.guest-drawer').classList.contains('is-open')`), true);
  await pause(600);
  await capture('guest-drawer');
  assert.equal(await evaluate('window.__androidShell.back()'), true);
  await evaluate(`document.querySelector('.android-nav-toggle').click()`);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pager')).filter`), 'blur(10px)');
  assert.equal(await evaluate(`document.querySelector('.pager').inert`), true);
  assert.equal(await evaluate(`window.__androidShell.canRefresh(100,200)`), false);
  await capture('menu');
  assert.equal(await evaluate('window.__androidShell.back()'), true);
  await evaluate(`document.querySelector('.android-nav-toggle').click();document.querySelector('.android-nav-backdrop').click()`);
  assert.equal(await evaluate('document.body.classList.contains("android-nav-open")'), false);
  await goTo('top');
  console.log(`PASS: menu blur, six destinations, drawers, scroll/state preservation, refresh gating; native viewport ${original.width}×${original.height}`);
} finally {
  await client.send('Emulation.clearDeviceMetricsOverride');
  client.close();
}
