// One command to prove the app is healthy: typecheck, unit tests, colour contrast, production build, dependency audit.
// Optional: --e2e also runs the end-to-end tests over HTTP (local data service by default; E2E_ENDPOINT and E2E_KEY target a deployed one).
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
  // Runs over real HTTP against a local server that runs the real Code.gs. Set E2E_ENDPOINT and E2E_KEY to use a deployed web app instead.
  steps.push([process.env.E2E_ENDPOINT ? 'End-to-end against the deployed web app' : 'End-to-end over HTTP (local data service)', 'npm', ['run', 'test:e2e', '--silent']]);
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
