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
    ['Mode', esc(p.mode.toUpperCase())],
    ['Amount received', esc(formatRupees(r.amount))],
    ['Balance for the month', esc(formatRupees(Math.max(r.balanceAfter, 0)))],
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt ${r.number}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:0;padding:24px;color:#111}
  .box{max-width:480px;margin:0 auto;border:1px solid #999;border-radius:8px;padding:20px;position:relative}
  h1{margin:0 0 2px;font-size:20px} .no{color:#444;margin:0 0 16px}
  table{width:100%;border-collapse:collapse} td{padding:8px 0;border-bottom:1px solid #ddd} td:last-child{text-align:right;font-weight:600}
  .sig{margin-top:32px;text-align:right;color:#444}
  .void{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:72px;font-weight:800;color:rgba(200,0,0,.25);transform:rotate(-20deg);pointer-events:none}
</style></head><body>
<div class="box">
  ${r.voided ? '<div class="void">VOID</div>' : ''}
  <h1>${esc(o.tuitionName)}</h1>
  <p class="no">Receipt No. ${r.number}</p>
  <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
  ${r.voided ? `<p><strong>VOID</strong>${r.voidReason ? ` - ${esc(r.voidReason)}` : ''}</p>` : ''}
  <p class="sig">${esc(o.teacherName)}</p>
</div>
</body></html>`;
}
