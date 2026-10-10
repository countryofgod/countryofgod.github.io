/**
 * 把仓库根的 daily/ 同步到 public/daily/。
 *
 *   node tools/sync-daily.mjs
 *
 * 为什么需要这一步：内容文件必须放在仓库根（GitHub Pages 直接服务仓库根，
 * 前端 fetch 的 daily/<分类>/<年>_<月>_<日>.txt 才能命中），
 * 而 Node 版与 Workers 版的静态目录都只有一个 public/。
 * 于是：Node 版在 app.js 里把 /daily 映射回仓库根（不依赖本脚本）；
 * Workers 版没有运行时读文件的能力，只能在部署前把内容复制进 public/。
 *
 * 由 npm 生命周期自动触发（predeploy / predev），一般不用手动跑。
 * public/daily/ 是纯生成物，不入库（见 .gitignore）。
 */
import { cpSync, existsSync, mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'daily');
const dest = join(root, 'public', 'daily');

if (!existsSync(src)) {
  console.log('daily/ 不存在，跳过同步');
  process.exit(0);
}

// 先整目录重建：源里删掉的文件不能在 public/ 里留下残影
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// 生成每日清单（public/daily-manifest.json）：把每天的文/诗/乐也并进档案馆网格。
// Worker 无文件系统，靠 ASSETS 绑定读这份静态 JSON；Node 直接读文件。
// 音乐文件首行是占位栏目标题（如"每日歌单（每日一曲）"），真正的歌名在
// 每首 "歌名|直链" 这一行的 | 之前。与 parseMusic 同口径：按空行分块，
// 每块首行才是歌名（其余行是副标题/歌词），所以只取每块首行。
const musicTitle = (text) => {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++; // 跳过前导空行与首行占位标题
  const names = [];
  let inBlock = false;
  for (let j = i + 1; j < lines.length; j++) {
    const s = lines[j].trim();
    if (!s) { inBlock = false; continue; } // 空行＝一首歌的分隔
    if (!inBlock) {
      const cut = s.indexOf('|');
      const name = (cut >= 0 ? s.slice(0, cut) : s).trim();
      if (name) names.push(name);
      inBlock = true;
    }
  }
  return names.join('、') || '每日歌单';
};

const manifest = [];
for (const cat of ['article', 'poem', 'music']) {
  const dir = join(src, cat);
  if (!existsSync(dir)) continue;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.txt')) continue;
    const parts = name.replace(/\.txt$/, '').split('_').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) continue;
    const [y, mo, d] = parts;
    const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const text = readFileSync(join(dir, name), 'utf8');
    const lines = text.split(/\r?\n/);
    let i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    manifest.push({
      date: iso,
      year: y,
      month: mo,
      category: cat,
      title: cat === 'music' ? musicTitle(text) : (lines[i] || '').trim(),
      href: `/d/${iso}/${cat}`,
    });
  }
}
manifest.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
writeFileSync(join(root, 'public', 'daily-manifest.json'), JSON.stringify(manifest));

// 同一份清单再生成一个 ES 模块，直接打包进 Worker。
// 为什么需要：Worker 运行时并没有 ASSETS 绑定（assets 只让平台直接下发静态文件，
// 不会给 Worker 注入 env.ASSETS；线上实测未匹配路由走 env.ASSETS.fetch 会抛异常→500）。
// 原先 getArchive 里写的是 if (env.ASSETS)，绑定不存在就静默跳过，
// 于是 Worker 版档案馆里一条每日都看不到（Node 版读磁盘所以正常）。
// 生成成模块后打包进去，档案馆不再依赖任何运行时绑定。
writeFileSync(
  join(root, 'worker', 'src', 'daily-manifest.js'),
  '// 由 tools/sync-daily.mjs 生成，请勿手改。\n' +
    '// 每日清单的 Worker 版副本：打包进 Worker，供 getArchive 并进档案馆。\n' +
    'export const dailyManifest = ' + JSON.stringify(manifest) + ';\n'
);

console.log(`daily/ → public/daily/ 已同步；daily-manifest.json 已生成（${manifest.length} 条）`);
