// Checks that the colour pairs in src/styles.css meet WCAG AA (4.5:1 for text, 3:1 for large text and UI).
// Usage: node scripts/check-contrast.mjs   (exit code 1 on any failure)
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));

const tokens = {};
for (const m of root.matchAll(/--([\w-]+):\s*oklch\(([^)]+)\)/g)) {
  const [l, c, h = '0'] = m[2].split('/')[0].trim().split(/\s+/).map(Number);
  tokens[m[1]] = { l, c, h };
}

const lin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function toSrgb({ l: L, c: C, h }) {
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const rgb = [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_];
  return rgb.map((x) => Math.min(1, Math.max(0, lin(x))));
}
const luminance = (t) => {
  const [r, g, b] = toSrgb(t).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio, where it is used]
const pairs = [
  ['ink', 'bg', 4.5, 'body text'],
  ['ink', 'surface', 4.5, 'text on cards'],
  ['muted', 'bg', 4.5, 'secondary text on page'],
  ['muted', 'surface', 4.5, 'secondary text on cards'],
  ['muted', 'surface-2', 4.5, 'labels on tinted areas'],
  ['on-primary', 'primary', 4.5, 'top bar, primary buttons'],
  ['primary-ink', 'primary-soft', 4.5, 'active tab, notes'],
  ['primary-ink', 'surface', 4.5, 'filter bar'],
  ['ok', 'ok-soft', 4.5, 'present'],
  ['bad', 'bad-soft', 4.5, 'absent, errors'],
  ['warn', 'warn-soft', 4.5, 'leave, warnings'],
  ['tint-blue-ink', 'tint-blue', 4.5, 'home tile blue'],
  ['tint-violet-ink', 'tint-violet', 4.5, 'home tile violet'],
  ['tint-green-ink', 'tint-green', 4.5, 'home tile green'],
  ['tint-amber-ink', 'tint-amber', 4.5, 'home tile amber'],
  ['primary', 'surface', 4.5, 'links, outlines'],
  ['field-border', 'surface', 3, 'form field borders (WCAG 1.4.11 non-text contrast)'],
  ['field-border', 'bg', 3, 'form field borders on the page background'],
];

let failed = 0;
for (const [fg, bg, min, use] of pairs) {
  if (!tokens[fg] || !tokens[bg]) {
    console.log(`SKIP  ${fg} on ${bg}: token not found`);
    continue;
  }
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2)}:1 (need ${min})  ${fg} on ${bg}  - ${use}`);
}
if (failed) {
  console.error(`\n${failed} colour pair(s) below the minimum.`);
  process.exit(1);
}
console.log('\nAll colour pairs meet their minimum contrast.');
