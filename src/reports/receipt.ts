import type { Payment } from '../domain/types';
import { monthLabel } from '../domain/dates';
import { formatRupees } from '../domain/money';

export interface ReceiptOptions { teacherName: string; tuitionName: string }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A self-contained, print-ready receipt page. Printing it from the phone ("Save as PDF")
 * yields the PDF, and works with any script (including Indian-language names and the rupee sign).
 */
export function receiptHtml(p: Payment, o: ReceiptOptions): string {
  const r = p.receipt;
  const rows: [string, string][] = [
    ['Student', esc(r.studentName)],
    ['Fee for', esc(monthLabel(r.forMonth))],
    ['Date paid', esc(r.issuedOn)],
    ['Paid by', esc(p.mode.toUpperCase())],
    ['Balance for the month', esc(formatRupees(Math.max(r.balanceAfter, 0)))],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${r.number}</title>
<style>
  @page{margin:14mm}
  *{box-sizing:border-box}
  body{font-family:'Inter','DM Sans','Segoe UI',system-ui,-apple-system,Roboto,'Noto Sans',sans-serif;font-kerning:normal;text-rendering:optimizeLegibility;margin:0;padding:16px;color:#14211c;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .box{max-width:520px;margin:0 auto;border:1px solid #cfd9d4;border-radius:14px;overflow:hidden;position:relative}
  .band{background:#224a71;color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px}
  .band h1{margin:0;font-size:20px;line-height:1.2;font-weight:600;letter-spacing:-.02em}
  .no{margin:0;font-size:13px;font-weight:600;white-space:nowrap;letter-spacing:.01em;background:rgba(255,255,255,.18);padding:4px 12px;border-radius:999px}
  .amount{padding:22px 20px 8px}
  .amount small{display:block;color:#4d5f58;font-size:14px;font-weight:600}
  .amount b{display:block;font-size:40px;line-height:1.1;font-weight:600;color:#224a71;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
  table{width:calc(100% - 40px);margin:6px 20px 0;border-collapse:collapse}
  td{padding:11px 0;border-bottom:1px solid #e3eae6;font-size:15px}
  td:first-child{color:#4d5f58}
  td:last-child{text-align:right;font-weight:600;font-variant-numeric:tabular-nums}
  tr:last-child td{border-bottom:0}
  .foot{padding:18px 20px 22px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;color:#4d5f58;font-size:14px}
  .foot strong{display:block;color:#14211c;font-size:15px}
  .void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:84px;font-weight:900;color:rgba(190,30,20,.22);transform:rotate(-20deg);pointer-events:none}
  .voidnote{margin:8px 20px 0;padding:10px 12px;background:#fde8e6;color:#a31f16;border-radius:10px;font-size:14px;font-weight:700}
</style></head><body>
<div class="box">
  ${r.voided ? '<div class="void">VOID</div>' : ''}
  <div class="band"><h1>${esc(o.tuitionName)}</h1><p class="no">Receipt No. ${r.number}</p></div>
  <div class="amount"><small>Amount received</small><b>${esc(formatRupees(r.amount))}</b></div>
  ${r.voided ? `<p class="voidnote">VOID${r.voidReason ? ` - ${esc(r.voidReason)}` : ''}</p>` : ''}
  <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
  <div class="foot"><span>Thank you</span><span>Received by<strong>${esc(o.teacherName)}</strong></span></div>
</div>
</body></html>`;
}
