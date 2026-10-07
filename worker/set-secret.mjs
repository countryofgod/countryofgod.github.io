/**
 * 在 Windows 上写 wrangler secret 用：
 *
 *   node worker/set-secret.mjs ADMIN_PASSWORD 你的口令
 *
 * 为什么不直接 `echo xxx | wrangler secret put`——PowerShell 5.1 的管道会往值里
 * 掺编码和换行，写进去的口令看着对、登录却一直失败，而且 secret 读不出来、没法排查。
 * 这里用 Node 起子进程，按精确字节写 stdin。
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [name, value] = process.argv.slice(2);

if (!name || value === undefined) {
  console.error('用法: node worker/set-secret.mjs <NAME> <VALUE>');
  console.error('例如: node worker/set-secret.mjs ADMIN_PASSWORD afterrainnn');
  process.exit(1);
}

const p = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', name], {
  cwd: root,
  stdio: ['pipe', 'inherit', 'inherit'],
});
p.stdin.end(value, 'utf8');
p.on('exit', (code) => process.exit(code ?? 0));
