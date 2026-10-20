// Makes a dated backup of all the tuition data as ONE JSON file in the same format as the app's "Export all data",
// so it can be restored in the app with More, Restore from backup file. Reads from your own Apps Script data service.
//
// Where the address and key come from (never typed on the command line, so they stay out of shell history):
//   - environment variables YT_ENDPOINT and YT_KEY, or
//   - a JSON file {"endpoint": "...", "key": "..."} at --config <path>, default %USERPROFILE%\.yours-tuition-backup.json
//
// Usage: npm run backup [-- --out C:/path/to/folder] [-- --keep 12] [-- --config C:/path/file.json]
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ENDPOINT_RE = /^(https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec|http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/[A-Za-z0-9_\-/]*)$/;

/** Downloads every file from the data service and writes backup-YYYY-MM-DD.json into outDir. Returns the file path. */
export async function backupTo({ endpoint, key, outDir, keep = 12, fetchImpl = fetch, now = new Date() }) {
  if (!ENDPOINT_RE.test(endpoint)) throw new Error('That is not a valid web app address.');
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key, action: 'snapshot' }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`The data service answered with an error (${res.status}).`);
  let reply;
  try {
    reply = await res.json();
  } catch {
    throw new Error('The data service did not answer as expected. Is the web app deployed for "Anyone"?');
  }
  if (!reply.ok) throw new Error(reply.error === 'auth' ? 'The secret key was not accepted.' : `The data service refused: ${reply.error}`);

  const files = Object.fromEntries(Object.entries(reply.files).map(([path, f]) => [path, f.content]));
  const backup = { app: 'yours-tuition', version: 1, exportedAt: now.toISOString(), files };
  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `yours-tuition-backup-${now.toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 2));

  const old = readdirSync(outDir).filter((f) => /^yours-tuition-backup-.*\.json$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) rmSync(join(outDir, f));
  return { file, count: Object.keys(files).length, removed: old.length };
}

function loadConfig(args) {
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  if (process.env.YT_ENDPOINT && process.env.YT_KEY) return { endpoint: process.env.YT_ENDPOINT, key: process.env.YT_KEY, opt };
  const path = opt('--config', join(homedir(), '.yours-tuition-backup.json'));
  if (!existsSync(path)) throw new Error(`No address and key found. Set YT_ENDPOINT and YT_KEY, or create ${path} with {"endpoint": "...", "key": "..."}`);
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  return { endpoint: cfg.endpoint, key: cfg.key, opt };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    const { endpoint, key, opt } = loadConfig(args);
    const out = opt('--out', process.env.BACKUP_DIR ?? join(homedir(), 'YOURS-Tuition-backups'));
    const r = await backupTo({ endpoint, key, outDir: out, keep: Number(opt('--keep', '12')) });
    console.log(`Saved ${r.count} data files to ${r.file}${r.removed ? ` (removed ${r.removed} old backup(s))` : ''}`);
  } catch (e) {
    console.error(`Backup failed: ${e.message}`);
    process.exit(1);
  }
}
