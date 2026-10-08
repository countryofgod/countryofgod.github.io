#!/usr/bin/env node
/**
 * 一键发布每日内容：把 daily/ 下的新增/修改提交、推上 GitHub，并部署到 Workers。
 *
 *   npm run daily                  # 提交 + push + 本地部署
 *   npm run daily -- --dry-run     # 只显示"将要做什么"，什么都不动
 *   npm run daily -- --no-deploy   # 提交 + push；跳过本地部署（等 CI 自动部署）
 *
 * 每天往 daily/article 或 daily/poem 里写一个 txt（文件名 = 发布日期，如 2026_10_9.txt；
 * 第一行标题、其余正文），然后跑这一条命令。它会：
 *   1. 校验文件名与内容——写错名字（如 2026_10_08，月日多补了零）或空文件会被挡下：
 *      这两种情况前端都只是静默不显示，先挡比事后上线了才发现快；
 *   2. git add -A daily/ 并提交，提交信息取标题；
 *   3. git push origin main —— GitHub Pages 随之更新，CI 也会部署一次 Workers；
 *   4. npm run deploy —— 本地再立即部署一次 Workers（predeploy 会把 daily/ 同步进 public/）。
 */
import { execFileSync, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const noDeploy = argv.includes('--no-deploy');

const log = (s = '') => console.log(s);
const fail = (s) => {
  console.error('FAIL  ' + s);
  process.exit(1);
};

/** git：要读输出的走 gitOut，要让用户看见过程的走 gitRun */
const gitOut = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const gitRun = (...args) => execFileSync('git', args, { cwd: root, stdio: 'inherit' });

const today = new Date();
const dayNum = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);
const todayNum = dayNum(today.getFullYear(), today.getMonth() + 1, today.getDate());
const todayName = `${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
log(`今天 ${today.getFullYear()}.${today.getMonth() + 1}.${today.getDate()}（今天的文件名写作 ${todayName}.txt）`);

/* ---------- 1. 看 daily/ 下有什么改动 ---------- */
const statusRaw = gitOut('status', '--porcelain', '--', 'daily');
if (!statusRaw.trim()) {
  log('daily/ 下没有改动——先写好 daily/article 或 daily/poem 里的 txt，再跑本命令');
  process.exit(0);
}

// porcelain 每行是「XY<空格>路径」，XY 里的空格算格式的一部分：
// 不能在整段输出上 trim——那会吃掉首行的前导空格，路径跟着错位一位，
// 未暂存的修改（" M"）与删除（" D"）就会被整个漏掉
const changes = statusRaw
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => {
    const code = line.slice(0, 2).trim() || '??';
    let path = line.slice(3).trim().replace(/^"(.*)"$/, '$1');
    const arrow = path.indexOf(' -> '); // 重命名写成 "old -> new"，取新名字
    if (arrow >= 0) path = path.slice(arrow + 4).replace(/^"(.*)"$/, '$1');
    return { code, path };
  })
  .filter((c) => c.path.startsWith('daily/'));

/* ---------- 2. 校验新增/修改的 txt，标题留作提交信息 ---------- */
const touched = []; // 新增 / 修改：{ category, name, num, title, path }
const removed = [];
for (const c of changes) {
  if (c.code.startsWith('D')) {
    removed.push(c.path);
    continue;
  }
  if (c.path.endsWith('.gitkeep')) continue; // 占位文件，忽略
  if (!c.path.endsWith('.txt')) fail(`daily/ 下只放 .txt 内容文件：${c.path}`);

  const m = c.path.match(/^daily\/(article|poem)\/(.+)\.txt$/);
  if (!m) fail(`路径不对：${c.path}（应为 daily/article/… 或 daily/poem/…）`);
  const category = m[1];
  const name = m[2];

  // 文件名必须是 年_月_日 且月、日不补前导零——前端就是按这个拼文件名去取的
  const nm = name.match(/^(\d{4})_(\d{1,2})_(\d{1,2})$/);
  if (!nm) fail(`文件名不对：${c.path}（应为 年_月_日，如 ${todayName}.txt）`);
  const [, y, mo, d] = nm;
  const canonical = `${Number(y)}_${Number(mo)}_${Number(d)}`;
  if (name !== canonical) fail(`文件名要写 daily/${category}/${canonical}.txt —— 月、日不补零，多补的零会让前端取不到它`);
  const dt = new Date(Number(y), Number(mo) - 1, Number(d));
  if (dt.getFullYear() !== Number(y) || dt.getMonth() !== Number(mo) - 1 || dt.getDate() !== Number(d)) {
    fail(`日期不存在：${name}.txt`);
  }

  const text = readFileSync(join(root, c.path), 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++; // 跳过开头的空行，与前端取标题的规则一致
  const title = (lines[i] || '').trim();
  if (!title) fail(`${c.path} 是空的（第一行要写标题；空文件前端会当成"这天没有"）`);

  touched.push({ category, name, num: dayNum(y, mo, d), title, path: c.path });
}

if (!touched.length && !removed.length) {
  log('daily/ 下没有要发布的内容改动（只有占位文件）');
  process.exit(0);
}

/* ---------- 3. 打印这次要发布什么 ---------- */
log('');
log('本次将发布：');
for (const t of touched) {
  const future = t.num > todayNum ? '  ← 未来日期：到那天才会出现在首页' : '';
  log(`  + daily/${t.category}/${t.name}.txt  「${t.title}」${future}`);
}
for (const p of removed) log(`  - ${p}（删除）`);

/* ---------- 4. 提交 ---------- */
const headline = touched.length
  ? `每日内容：${touched
      .slice(0, 2)
      .map((t) => `${t.title}（${t.name}）`)
      .join('、')}${touched.length > 2 ? ` 等 ${touched.length} 篇` : ''}`
  : `每日内容：删除 ${removed.length} 个文件`;
const body = [...touched.map((t) => `+ ${t.path}`), ...removed.map((p) => `- ${p}`)].join('\n');

if (dryRun) {
  log('');
  log('--dry-run：以下命令不会真的执行——');
  log('  git add -A daily');
  log(`  git commit -m "${headline}"`);
  log('  git push origin main');
  if (!noDeploy) log('  npm run deploy');
  process.exit(0);
}

log('');
gitRun('add', '-A', 'daily');
gitRun('commit', '-m', headline, '-m', body);

/* ---------- 5. push（GitHub Pages 靠它更新） ---------- */
try {
  gitRun('push', 'origin', 'main');
} catch {
  fail('push 失败（网络问题，或远端有新提交）。本机提交已经做好——恢复后手动 `git push origin main` 即可');
}

/* ---------- 6. 部署（Workers 立即生效；CI 之后也会再部署一次，无妨） ---------- */
if (noDeploy) {
  log('');
  log('已跳过本地部署（--no-deploy）：等 CI 自动部署 Workers');
  process.exit(0);
}
log('');
log('部署到 Cloudflare Workers…');
try {
  execSync('npm run deploy', { cwd: root, stdio: 'inherit' });
} catch {
  fail('部署失败。GitHub Pages 已经更新；问题修好后手动 `npm run deploy` 即可');
}

log('');
log('全部完成：GitHub Pages 与 Workers 都已更新');
