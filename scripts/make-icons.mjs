// Generates the PWA icons (no dependencies): a teal tile with a white "Y".
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function icon(size) {
  const bg = [0x22, 0x4a, 0x71], fg = [255, 255, 255];
  const w = size * 0.11; // stroke half-width
  const s = size;
  const segs = [[0.3, 0.27, 0.5, 0.52], [0.7, 0.27, 0.5, 0.52], [0.5, 0.52, 0.5, 0.76]].map((v) => v.map((n) => n * s));
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.min(...segs.map(([ax, ay, bx, by]) => segDist(x + 0.5, y + 0.5, ax, ay, bx, by)));
      const a = Math.max(0, Math.min(1, w + 0.5 - d)); // antialiased edge
      const o = y * (size * 4 + 1) + 1 + x * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(bg[i] * (1 - a) + fg[i] * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) writeFileSync(`public/icon-${size}.png`, icon(size));
writeFileSync('public/favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#224a71"/><path d="M19 17l13 16 13-16M32 33v16" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>');
console.log('icons written');
