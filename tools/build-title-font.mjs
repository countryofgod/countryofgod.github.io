#!/usr/bin/env node
/**
 * 重建 GitHub Pages 静态副本的标题字体子集
 * （AaGuDianKeBenSong-WebTitles.woff2，index.html 里 font-family: 'KeBenSong' 那份）。
 *
 *   node tools/build-title-font.mjs
 *
 * 为什么要有这个脚本：那份子集原本只包首页**静态**标题用字（60 字，见 README「标题字体子集」）。
 * 但「每日」右栏的标题是运行时 fetch daily/*.txt 得来的——诗题、文题、曲名每天都在换，
 * 命中不了这 60 字就会掉到 1.5 MB 的 KeBenSongFull（font-display: swap），
 * 在它下载完之前那个字显示成系统宋体：标题里出现"某一个字跟别的字不一样"。
 * 本脚本把「最近 60 天内 daily/ 里会出现在标题位上的字」并进字集，一次性生成好。
 *
 * 60 天这个窗口照抄前端：页面当天没有就往前找最近的一篇，最多往回 60 天（见 site.js findDaily）。
 * 更早的文件不会再被显示，把它们的字留在字集里只会让 woff2 无谓地变大。
 *
 * 生成后记得提交 + push（Pages 与 Workers 都读这两个文件）：
 *   git add tools/charset-title.txt AaGuDianKeBenSong-WebTitles.woff2 && git commit && git push
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (s) => { console.error('FAIL  ' + s); process.exit(1); };

const TTF = join(root, 'AaGuDianKeBenSongYouMoBan', 'AaGuDianKeBenSongYouMoBan-2.ttf');
const OUT = join(root, 'AaGuDianKeBenSong-WebTitles.woff2');
const CHARSET = join(root, 'tools', 'charset-title.txt');
const RENDERED = join(root, 'tools', 'charset-rendered.json');

if (!existsSync(TTF)) fail(`找不到源字体 ${TTF}`);

/* ---------- 1. 基线：静态标题用字 ∪ 数字与标题常用标点 ----------
   title 那份来自 tools/charset-rendered.json（按 --font-title 的 13 个选择器分桶采集，
   含伪元素 content / placeholder / value）；下面这串是与它配套的"数字 + 标点"，
   两者合起来就是 README 里那个 60 字的静态字集。改了首页静态标题要重跑采集，
   采集脚本的产物写回 charset-rendered.json，本脚本再跑一次即可。 */
const PUNCT_DIGITS = '0123456789©·×÷—‘’”…↓①②、。《》「」【】（）：；';
const base = new Set(PUNCT_DIGITS);
if (existsSync(RENDERED)) {
  try {
    const rendered = JSON.parse(readFileSync(RENDERED, 'utf8'));
    for (const ch of rendered.title || '') base.add(ch);
  } catch (e) {
    fail(`tools/charset-rendered.json 读不出来：${e.message}`);
  }
} else {
  console.log('warn  没有 tools/charset-rendered.json，字集只含数字标点 + 每日标题');
}

/* ---------- 2. 最近 60 天 daily/ 里会显示在标题位上的字 ----------
   article / poem：第一行就是标题。
   music：第一行是歌单名（屏内与右栏都不显示它），真正显示的是每个块第一行的曲名。 */
const WINDOW_DAYS = 60;
const dayNum = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);
const now = new Date();
const todayNum = dayNum(now.getFullYear(), now.getMonth() + 1, now.getDate());
const oldestNum = dayNum(
  ...(() => { const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - WINDOW_DAYS); return [t.getFullYear(), t.getMonth() + 1, t.getDate()]; })()
);

const firstLine = (text) => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  return (lines[i] || '').trim();
};

/* 每日标题里的 ASCII 不加：.daily-title 的字体栈是 'LoveLetter' 打头，
   拉丁字母与数字本来就有，交给它就行——把这些字塞进刻本宋子集只是白占字节 */
const addTitleChars = (s) => {
  for (const ch of s) {
    if (ch.codePointAt(0) < 0x2000) continue;
    base.add(ch);
  }
};

const oldCharset = existsSync(CHARSET) ? readFileSync(CHARSET, 'utf8') : '';
const picked = [];
for (const category of ['article', 'poem', 'music']) {
  const dir = join(root, 'daily', category);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.txt')) continue;
    const m = name.replace(/\.txt$/, '').match(/^(\d{4})_(\d{1,2})_(\d{1,2})$/);
    if (!m) continue;
    const num = dayNum(m[1], m[2], m[3]);
    if (num < oldestNum || num > todayNum) continue; // 窗口外：前端不会取到它
    const text = readFileSync(join(dir, name), 'utf8');
    if (category === 'music') {
      for (const line of text.split(/\r?\n/)) {
        const cut = line.indexOf('|');
        if (cut <= 0) continue;                       // 没有 | 的行不是曲目行
        addTitleChars(line.slice(0, cut).trim());
      }
    } else {
      addTitleChars(firstLine(text));
    }
    picked.push(`daily/${category}/${name}`);
  }
}

/* ---------- 3. 写字集 ---------- */
const chars = [...base].sort();
writeFileSync(CHARSET, chars.join(''), 'utf8');
console.log(`字集 ${chars.length} 字（基线 ${new Set(PUNCT_DIGITS).size + (() => { try { return (JSON.parse(readFileSync(RENDERED, 'utf8')).title || '').length; } catch { return 0; } })()} + 每日标题）`);
console.log(`纳入的每日文件 ${picked.length} 个${picked.length ? '：' + picked.join('、') : ''}`);
if (oldCharset) console.log(`（旧字集 ${[...oldCharset].length} 字 → 新字集 ${chars.length} 字）`);

/* ---------- 4. 重新子集 ---------- */
const py = process.platform === 'win32' ? 'python' : 'python3';
try {
  execFileSync(py, [
    '-m', 'fontTools.subset', TTF,
    `--text-file=${CHARSET}`,
    '--flavor=woff2',
    '--layout-features=*',
    `--output-file=${OUT}`,
  ], { cwd: root, stdio: 'inherit' });
} catch {
  fail('pyftsubset 跑失败（需要 python + fontTools：pip install fonttools brotli）');
}

/* ---------- 5. 验收：字集里每个字都必须在新 woff2 的 cmap 里 ---------- */
try {
  const check = execFileSync(py, ['-c', `
import sys
from fontTools.ttLib import TTFont
t = TTFont(r"${OUT.replace(/\\/g, '\\\\')}", fontNumber=-1)
cm = t.getBestCmap()
missing = [c for c in open(r"${CHARSET.replace(/\\/g, '\\\\')}", encoding='utf-8').read() if ord(c) not in cm]
print('OK' if not missing else 'MISSING ' + ''.join(missing))
`], { cwd: root, encoding: 'utf8' });
  const line = check.trim().split('\n').pop().trim();
  if (line.startsWith('MISSING')) fail(`新字体里没有这些字：${line.slice(8)}（源字体缺字，或字集没写进去）`);
} catch (e) {
  if (e && e.status !== undefined) fail(e.message || '校验失败');
  throw e;
}

const kb = Math.round(statSync(OUT).size / 1024);
console.log(`已生成 ${OUT.replace(root + '\\', '')}（${kb} KB），字集缺字 0`);
