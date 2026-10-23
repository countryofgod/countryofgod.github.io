import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const android = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const adb = process.env.ADB || 'adb';
const device = process.env.ANDROID_SERIAL;
const output = resolve(android, '.toolchain/native-check');
const prefix = device ? ['-s', device] : [];
const run = (...args) => execFileSync(adb, [...prefix, ...args], { encoding: 'utf8', timeout: 30000 });
const pause = ms => new Promise(done => setTimeout(done, ms));
const dimensions = [...run('shell', 'wm', 'size').matchAll(/(\d+)x(\d+)/g)].pop();
const width = Number(dimensions[1]);
const height = Number(dimensions[2]);
mkdirSync(output, { recursive: true });

function tree() {
  run('shell', 'uiautomator', 'dump', '--compressed', '/sdcard/country-native-check.xml');
  const xml = run('shell', 'cat', '/sdcard/country-native-check.xml');
  if (xml.includes('android.webkit.WebView')) throw new Error('WebView found in native UI');
  if (!xml.includes('dev.countryofgod.app.debug')) throw new Error('Native app not in foreground');
  return xml;
}

function nodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>?/g)].map(match =>
    Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(pair => [pair[1], pair[2]])));
}

function tapNode(xml, label) {
  const node = nodes(xml).find(item => item['content-desc'] === label || item.text === label);
  if (!node) throw new Error(`Missing control: ${label}`);
  const bounds = node.bounds.match(/\d+/g).map(Number);
  run('shell', 'input', 'tap', String((bounds[0] + bounds[2]) >> 1), String((bounds[1] + bounds[3]) >> 1));
}

function shot(name, xml) {
  writeFileSync(resolve(output, `${name}.xml`), xml);
  run('shell', 'screencap', '-p', '/sdcard/country-native-check.png');
  run('pull', '/sdcard/country-native-check.png', resolve(output, `${name}.png`));
}

async function select(label) {
  let xml = tree();
  tapNode(xml, '章节导航');
  await pause(300);
  xml = tree();
  for (let attempt = 0; attempt < 6 && !nodes(xml).some(item => item.text === label); attempt++) {
    const menu = nodes(xml).find(item => item.class === 'android.widget.ScrollView');
    if (!menu) throw new Error('Native navigation scroll missing');
    const bounds = menu.bounds.match(/\d+/g).map(Number);
    const center = String((bounds[0] + bounds[2]) >> 1);
    const top = String(bounds[1] + 16);
    const bottom = String(bounds[3] - 16);
    const down = ['récapitulation', 'cadenza', 'coda'].includes(label);
    run('shell', 'input', 'swipe', center, down ? bottom : top, center, down ? top : bottom, '250');
    await pause(200);
    xml = tree();
  }
  tapNode(xml, label);
  await pause(1300);
  return tree();
}

const originalAnimation = run('shell', 'settings', 'get', 'global', 'animator_duration_scale').trim();
const originalFontScale = run('shell', 'settings', 'get', 'system', 'font_scale').trim();
const originalSize = run('shell', 'wm', 'size').match(/Override size: (\d+x\d+)/)?.[1];
try {
run('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0');
run('shell', 'am', 'force-stop', 'dev.countryofgod.app.debug');
run('shell', 'am', 'start', '-n', 'dev.countryofgod.app.debug/dev.countryofgod.app.MainActivity');
await pause(1200);
let xml;
if (!process.argv.includes('--layout-only')) {
for (const [label, expected, name] of [
  ['Introduction', '上帝之國', '01-introduction'],
  ['exposition', '呈示部', '02-exposition'],
  ['développement', '展開部', '03-developpement'],
  ['récapitulation', '再現部', '04-recapitulation'],
  ['cadenza', '華彩段', '05-cadenza'],
  ['coda', 'Es mus sein!', '06-coda'],
]) {
  const xml = await select(label);
  if (!xml.includes(expected)) throw new Error(`Missing page content: ${expected}`);
  if (!xml.includes('android.widget.ScrollView')) throw new Error('Missing native scrolling');
  shot(name, xml);
  console.log(`PASS native ${label}`);
}
xml = tree();
tapNode(xml, '章节导航');
await pause(300);
xml = tree();
if (xml.includes('Es mus sein!')) throw new Error('Blurred background still in accessibility tree');
shot('07-menu-blur', xml);
run('shell', 'input', 'keyevent', '4');
await pause(300);
if (!tree().includes('Es mus sein!')) throw new Error('System back did not dismiss menu');
console.log('PASS menu background isolation and system back');
xml = await select('exposition');
tapNode(xml, 'music');
await pause(700);
shot('08-ipod-music', tree());
run('shell', 'input', 'keyevent', '4');
await pause(300);
if (!tree().includes('content-desc="article"')) throw new Error('iPod back did not restore menu');
xml = await select('développement');
tapNode(xml, '展开本期目录');
await pause(400);
shot('09-directory', tree());
run('shell', 'input', 'keyevent', '4');
xml = await select('récapitulation');
tapNode(xml, 'random');
await pause(1600);
xml = tree();
if (!xml.includes('上帝之国 · 再现部')) throw new Error('Native reader missing');
if (xml.includes('content-desc="random"')) throw new Error('Reader background still accessible');
shot('10-reader', xml);
for (let attempt = 0; attempt < 16 && !xml.includes('留下回声'); attempt++) {
  run('shell', 'input', 'swipe', String(Math.round(width / 2)), String(Math.round(height * 0.8)),
    String(Math.round(width / 2)), String(Math.round(height * 0.25)), '180');
  await pause(150);
  xml = tree();
}
if (!xml.includes('回声') || !xml.includes('留下回声')) throw new Error('Native reader echo missing');
shot('10-reader-echo', xml);
run('shell', 'input', 'keyevent', '4');
xml = await select('coda');
tapNode(xml, '留言');
await pause(600);
shot('11-guestbook', tree());
run('shell', 'input', 'keyevent', '4');
xml = tree();
tapNode(xml, 'Upload?');
await pause(600);
run('shell', 'input', 'keyevent', '4');
await pause(400);
if (!tree().includes('Es mus sein!')) throw new Error('Picker cancellation did not restore form');
console.log('PASS iPod, directory, native reader, guest drawer and picker cancellation');
}
for (const mode of [
  { size: '960x1707', scale: '1.0', pages: ['Introduction', 'exposition'], name: '12-small' },
  { size: '1080x1920', scale: '1.3', pages: ['récapitulation', 'coda'], name: '13-large-text' },
  { size: '1920x1080', scale: '1.0', pages: ['Introduction', 'coda'], name: '14-landscape', optional: true },
]) {
  run('shell', 'settings', 'put', 'system', 'font_scale', mode.scale);
  await pause(1100);
  run('shell', 'wm', 'size', mode.size);
  await pause(1500);
  const [modeWidth, modeHeight] = mode.size.split('x');
  xml = tree();
  if (mode.optional && nodes(xml)[0]?.bounds !== `[0,0][${modeWidth},${modeHeight}]`) {
    console.log(`SKIP ${mode.name}: emulator retains ${nodes(xml)[0]?.bounds}`);
    continue;
  }
  for (const label of mode.pages) {
    xml = await select(label);
    if (nodes(xml)[0]?.bounds !== `[0,0][${modeWidth},${modeHeight}]`) {
      throw new Error(`Display did not retain requested layout size: ${mode.size}`);
    }
    if (!xml.includes('android.widget.ScrollView')) throw new Error(`Responsive scroll missing: ${label}`);
    shot(`${mode.name}-${label}`, xml);
  }
  tapNode(xml, '章节导航');
  await pause(250);
  xml = tree();
  if (xml.includes('android.widget.EditText')) throw new Error('Responsive menu did not isolate background');
  shot(`${mode.name}-menu`, xml);
  run('shell', 'input', 'keyevent', '4');
  console.log(`PASS responsive ${mode.size}, font scale ${mode.scale}`);
}
console.log(`Screenshots: ${output}`);
} finally {
  run('shell', 'wm', 'size', originalSize || 'reset');
  if (originalFontScale === 'null') run('shell', 'settings', 'delete', 'system', 'font_scale');
  else run('shell', 'settings', 'put', 'system', 'font_scale', originalFontScale);
  if (originalAnimation === 'null') run('shell', 'settings', 'delete', 'global', 'animator_duration_scale');
  else run('shell', 'settings', 'put', 'global', 'animator_duration_scale', originalAnimation);
}
