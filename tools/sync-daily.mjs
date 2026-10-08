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
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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

console.log('daily/ → public/daily/ 已同步');
