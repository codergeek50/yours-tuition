// One command to prove the app is healthy: typecheck, unit tests, colour contrast, production build, dependency audit.
// Optional: --e2e runs the real-GitHub end-to-end tests (needs TEST_DATA_REPO and TEST_GITHUB_TOKEN in the environment).
// Usage: npm run verify [-- --e2e] [-- --skip-audit]
import { run, step, done } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const steps = [
  ['Typecheck', 'npm', ['run', 'typecheck', '--silent']],
  ['Unit and component tests', 'npm', ['test', '--silent']],
  ['Colour contrast (WCAG AA)', 'node', ['scripts/check-contrast.mjs']],
  ['Production build', 'npm', ['run', 'build', '--silent']],
];
if (!args.has('--skip-audit')) steps.push(['Dependency audit', 'npm', ['audit', '--audit-level=high']]);
if (args.has('--e2e')) {
  if (!process.env.TEST_DATA_REPO || !process.env.TEST_GITHUB_TOKEN) {
    console.error('--e2e needs TEST_DATA_REPO and TEST_GITHUB_TOKEN set in the environment (see .env.example).');
    process.exit(2);
  }
  steps.push(['End-to-end against a real private repo', 'npm', ['run', 'test:e2e', '--silent']]);
}

const results = [];
for (const [name, cmd, a] of steps) {
  const t0 = step(name);
  const ok = run(cmd, a) === 0;
  done(t0, ok);
  results.push([name, ok]);
  if (!ok) break;
}

console.log('\n--- Summary');
for (const [name, ok] of results) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
if (results.length < steps.length) console.log(`SKIP  ${steps.length - results.length} later step(s) after the failure`);
process.exit(results.every(([, ok]) => ok) && results.length === steps.length ? 0 : 1);
