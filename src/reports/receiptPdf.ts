import type { Payment } from '../domain/types';
import { monthLabel } from '../domain/dates';
import { formatRupees } from '../domain/money';

/** Size of the receipt picture in pixels (drawn at twice the size it is shown, so it stays sharp when zoomed). */
export const RECEIPT_SIZE = { width: 840, height: 900 } as const;

export interface ReceiptOptions { teacherName: string; tuitionName: string }

/** The part of a canvas context the receipt needs, so it can be drawn in tests without a browser. */
export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'font' | 'textAlign' | 'textBaseline'
  | 'save' | 'restore' | 'translate' | 'rotate' | 'beginPath' | 'closePath' | 'moveTo' | 'lineTo' | 'arcTo'
  | 'stroke' | 'fill' | 'fillRect' | 'fillText' | 'measureText'
>;

const INK = '#14211c';
const MUTED = '#4d5f58';
const BLUE = '#224a71';
const LINE = '#e3eae6';
const FONT = '"DM Sans", Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';

/** Shortens text to fit a width, ending with an ellipsis. */
function fit(ctx: DrawContext, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function roundedRect(ctx: DrawContext, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws the receipt (same design as the on-screen receipt) onto a canvas context. */
export function drawReceipt(ctx: DrawContext, p: Payment, o: ReceiptOptions): void {
  const { width: W, height: H } = RECEIPT_SIZE;
  const r = p.receipt;
  const left = 80;
  const right = W - 80;
  const text = (t: string, x: number, y: number, size: number, weight: number, color: string, align: 'left' | 'right' | 'center' = 'left') => {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x, y);
  };

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Card
  roundedRect(ctx, 40, 40, W - 80, H - 80, 28);
  ctx.strokeStyle = '#cfd9d4';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Band with the tuition name and the receipt number
  ctx.fillStyle = BLUE;
  ctx.fillRect(41, 41, W - 82, 112);
  ctx.font = `600 38px ${FONT}`;
  const number = `Receipt No. ${r.number}`;
  text(fit(ctx, o.tuitionName, 400), left, 112, 38, 600, '#ffffff');
  ctx.font = `600 26px ${FONT}`;
  const pillW = ctx.measureText(number).width + 48;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundedRect(ctx, right - pillW, 74, pillW, 52, 26);
  ctx.fill();
  text(number, right - 24, 109, 26, 600, '#ffffff', 'right');

  // Amount
  text('Amount received', left, 222, 28, 600, MUTED);
  text(formatRupees(r.amount), left, 306, 84, 600, BLUE);

  let y = 352;
  if (r.voided) {
    ctx.fillStyle = '#fde8e6';
    roundedRect(ctx, left, y, right - left, 52, 14);
    ctx.fill();
    text(fit(ctx, `VOID${r.voidReason ? ` - ${r.voidReason}` : ''}`, right - left - 40), left + 20, y + 36, 26, 700, '#a31f16');
    y += 72;
  }

  // Rows
  const rows: [string, string][] = [
    ['Student', r.studentName],
    ['Fee for', monthLabel(r.forMonth)],
    ['Date paid', r.issuedOn],
    ['Paid by', p.mode.toUpperCase()],
    ['Balance for the month', formatRupees(Math.max(r.balanceAfter, 0))],
  ];
  const rowH = 76;
  rows.forEach(([label, value], i) => {
    const base = y + rowH * i + 52;
    text(label, left, base, 30, 400, MUTED);
    text(fit(ctx, value, 330), right, base, 30, 600, INK, 'right');
    if (i < rows.length - 1) {
      ctx.fillStyle = LINE;
      ctx.fillRect(left, base + 22, right - left, 2);
    }
  });

  // Footer
  const foot = y + rowH * rows.length + 70;
  text('Thank you', left, foot, 30, 400, MUTED);
  if (o.teacherName) {
    text('Received by', right, foot - 6, 26, 400, MUTED, 'right');
    text(fit(ctx, o.teacherName, 360), right, foot + 34, 30, 600, INK, 'right');
  }

  if (r.voided) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.35);
    text('VOID', 0, 70, 240, 900, 'rgba(190,30,20,0.22)', 'center');
    ctx.restore();
  }
}

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const num = (n: number) => String(Math.round(n * 100) / 100);

/** Wraps a JPEG in a one-page PDF whose page is exactly the picture (half its pixel size, in points). */
export function pdfFromJpeg(jpeg: Uint8Array, pixelWidth: number, pixelHeight: number): Uint8Array<ArrayBuffer> {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('That is not a JPEG picture.');
  const w = num(pixelWidth / 2);
  const h = num(pixelHeight / 2);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
  const objects: Uint8Array[][] = [
    [ascii('<< /Type /Catalog /Pages 2 0 R >>')],
    [ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')],
    [ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)],
    [
      ascii(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      ascii('\nendstream'),
    ],
    [ascii(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)],
  ];

  const chunks: Uint8Array[] = [ascii('%PDF-1.4\n')];
  let offset = chunks[0]!.length;
  const offsets: number[] = [];
  objects.forEach((parts, i) => {
    offsets.push(offset);
    const piece = [ascii(`${i + 1} 0 obj\n`), ...parts, ascii('\nendobj\n')];
    for (const c of piece) { chunks.push(c); offset += c.length; }
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  chunks.push(ascii(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`));

  const out = new Uint8Array(new ArrayBuffer(chunks.reduce((n, c) => n + c.length, 0)));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

export const receiptFileName = (p: Payment) => `receipt-${p.receipt.number}.pdf`;

/** Draws the receipt on a real canvas and returns it as a PDF. Needs a browser. */
export async function renderReceiptPdf(p: Payment, o: ReceiptOptions): Promise<Blob> {
  try {
    // Make sure the page fonts are ready so the receipt matches the app.
    await Promise.all([document.fonts.load(`600 40px "DM Sans"`), document.fonts.load(`400 30px "DM Sans"`)]);
  } catch { /* the fallback font is fine */ }
  const canvas = document.createElement('canvas');
  canvas.width = RECEIPT_SIZE.width;
  canvas.height = RECEIPT_SIZE.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the receipt.');
  drawReceipt(ctx, p, o);
  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!jpeg) throw new Error('The receipt picture could not be made.');
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  return new Blob([pdfFromJpeg(bytes, RECEIPT_SIZE.width, RECEIPT_SIZE.height)], { type: 'application/pdf' });
}
