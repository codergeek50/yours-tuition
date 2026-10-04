// Small helpers shared by the automation scripts. No dependencies.
import { spawnSync } from 'node:child_process';

export const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// On Windows npm is a .cmd script and needs a shell; real executables (git, gh, node) must not use one.
const needsShell = (cmd) => process.platform === 'win32' && cmd === 'npm';

/** Run a command, streaming its output. Returns the exit status. */
export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: needsShell(cmd), ...opts });
  return r.status ?? 1;
}

/** Run a command and capture stdout. Throws on failure. */
export function capture(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: needsShell(cmd), ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`);
  return r.stdout;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function step(name) {
  console.log(`\n=== ${name}`);
  return performance.now();
}

export function done(t0, ok = true) {
  console.log(`${ok ? 'ok' : 'FAILED'} (${((performance.now() - t0) / 1000).toFixed(1)}s)`);
}

/** Patterns that look like real credentials. Used to refuse to publish them. */
export const SECRET_PATTERNS = [
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /sk-[A-Za-z0-9]{32,}/,
];
