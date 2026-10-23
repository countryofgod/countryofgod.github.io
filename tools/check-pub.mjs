import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function checkPubContent({ root = projectRoot, checkSynced = false } = {}) {
  const records = JSON.parse(readFileSync(join(root, 'tools', 'pub-content-lock.json'), 'utf8'));
  if (!Array.isArray(records) || !records.length) throw new Error('投稿保护清单不能为空');

  for (const record of records) {
    const content = readFileSync(join(root, record.path));
    const input = record.path.endsWith('.txt') ? content.toString('utf8').replace(/\r\n/g, '\n') : content;
    const digest = createHash('sha256').update(input).digest('hex');
    if (digest !== record.sha256) throw new Error(`投稿文件校验失败：${record.path}`);
    if (!checkSynced || !record.path.startsWith('daily/pub/')) continue;

    const synced = readFileSync(join(root, 'public', record.path));
    if (!content.equals(synced)) throw new Error(`投稿部署副本与原稿不同：${record.path}`);
    const manifest = JSON.parse(readFileSync(join(root, 'public', 'daily', 'pub', 'manifest.json'), 'utf8'));
    const filename = record.path.slice('daily/pub/'.length);
    if (!manifest.some((entry) => (typeof entry === 'string' ? entry : entry.file) === filename)) {
      throw new Error(`投稿部署清单缺少：${filename}`);
    }
    const pubEntry = manifest.find((entry) => entry.file === filename);
    const archive = JSON.parse(readFileSync(join(root, 'public', 'daily-manifest.json'), 'utf8'));
    if (!pubEntry || !archive.some((entry) => entry.category === 'pub' && entry.date === pubEntry.date
      && entry.href === `/d/${pubEntry.date}/pub`)) {
      throw new Error(`再现部清单缺少投稿：${filename}`);
    }
  }
  return records.length;
}
