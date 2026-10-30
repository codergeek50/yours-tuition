import { describe, it, expect } from 'vitest';
import { drawReceipt, pdfFromJpeg, RECEIPT_SIZE, type DrawContext } from './receiptPdf';
import type { Payment } from '../domain/types';

const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9]);

describe('pdfFromJpeg', () => {
  const pdf = pdfFromJpeg(fakeJpeg, 840, 900);
  const s = text(pdf);

  it('is a PDF with a header, a trailer and an end marker', () => {
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(s).toContain('/Type /Catalog');
    expect(s).toContain('/Type /Page');
  });

  it('has one page sized to the picture (840 x 900 px becomes 420 x 450 points)', () => {
    expect(s).toContain('/MediaBox [0 0 420 450]');
  });

  it('holds the JPEG bytes untouched, with the right length and filter', () => {
    expect(s).toContain('/Filter /DCTDecode');
    expect(s).toContain(`/Length ${fakeJpeg.length}`);
    const start = pdf.findIndex((_, i) => pdf[i] === 0xff && pdf[i + 1] === 0xd8 && pdf[i + 2] === 0xff && pdf[i + 3] === 0xe0);
    expect(Array.from(pdf.slice(start, start + fakeJpeg.length))).toEqual(Array.from(fakeJpeg));
  });

  it('has a cross-reference table whose offsets point at each object', () => {
    const startxref = Number(/startxref\s+(\d+)/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    const entries = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(entries.length).toBe(5);
    entries.forEach((off, i) => expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain('/Size 6');
  });

  it('draws the picture across the whole page', () => {
    expect(s).toContain('420 0 0 450 0 0 cm');
    expect(s).toContain('/Im0 Do');
  });

  it('refuses something that is not a JPEG', () => {
    expect(() => pdfFromJpeg(new Uint8Array([1, 2, 3]), 10, 10)).toThrow(/JPEG/);
  });
});

/** A canvas stand-in that records what was written, so the layout can be checked without a browser. */
function recorder() {
  const texts: { t: string; font: string; align: string; fill: string }[] = [];
  const rects: { fill: string; x: number; y: number; w: number; h: number }[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'alphabetic',
    save() {}, restore() {}, translate() {}, rotate() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arcTo() {}, stroke() {}, fill() {},
    fillRect(x: number, y: number, w: number, h: number) { rects.push({ fill: String(ctx.fillStyle), x, y, w, h }); },
    fillText(t: string) { texts.push({ t, font: String(ctx.font), align: String(ctx.textAlign), fill: String(ctx.fillStyle) }); },
    measureText: (t: string) => ({ width: t.length * 20 }),
  };
  return { ctx: ctx as unknown as DrawContext, texts, rects };
}

const payment = (o: Partial<Payment['receipt']> = {}): Payment => ({
  id: 'p', studentId: 's', forMonth: '2026-10', amount: 6000, paidOn: '2026-10-05', mode: 'upi',
  receipt: { number: 20260010, issuedOn: '2026-10-05', studentName: 'Asha Rao', amount: 6000, forMonth: '2026-10', balanceAfter: 400, voided: false, ...o },
});
const opts = { tuitionName: 'YOURS Tuition', teacherName: 'Mrs Rao' };

describe('drawReceipt', () => {
  it('writes every fact on the receipt', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment(), opts);
    const all = texts.map((x) => x.t);
    for (const expected of ['YOURS Tuition', 'Receipt No. 20260010', 'Amount received', '₹6,000', 'Student', 'Asha Rao', 'Fee for', 'October 2026', 'Date paid', '2026-10-05', 'Paid by', 'UPI', 'Balance for the month', '₹400', 'Thank you', 'Received by', 'Mrs Rao']) {
      expect(all).toContain(expected);
    }
  });

  it('paints a white page and a blue band', () => {
    const { ctx, rects } = recorder();
    drawReceipt(ctx, payment(), opts);
    expect(rects[0]).toMatchObject({ fill: '#ffffff', x: 0, y: 0, w: RECEIPT_SIZE.width, h: RECEIPT_SIZE.height });
    expect(rects.some((r) => r.fill === '#224a71')).toBe(true);
  });

  it('a voided receipt shows VOID and the reason', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment({ voided: true, voidReason: 'wrong amount' }), opts);
    const all = texts.map((x) => x.t);
    expect(all).toContain('VOID');
    expect(all.some((t) => t.includes('wrong amount'))).toBe(true);
  });

  it('a normal receipt has no VOID', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment(), opts);
    expect(texts.some((x) => x.t.includes('VOID'))).toBe(false);
  });

  it('a very long name is shortened with an ellipsis instead of running off the page', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment({ studentName: 'A'.repeat(120) }), opts);
    const long = texts.find((x) => x.t.startsWith('AAA'))!;
    expect(long.t.endsWith('…')).toBe(true);
    expect(long.t.length).toBeLessThan(120);
  });

  it('negative balances never show', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment({ balanceAfter: -300 }), opts);
    expect(texts.map((x) => x.t)).toContain('₹0');
  });

  it('works without a teacher name', () => {
    const { ctx, texts } = recorder();
    drawReceipt(ctx, payment(), { tuitionName: 'T', teacherName: '' });
    expect(texts.some((x) => x.t.includes('undefined'))).toBe(false);
  });
});
