import { describe, it, expect } from 'vitest';
import { toCsv } from './csv';
import { receiptHtml } from './receipt';
import type { Payment } from '../domain/types';

describe('CSV', () => {
  it('leaves real numbers alone, including negatives', () => {
    expect(toCsv([['Asha', -500, 0, 1200]])).toBe('Asha,-500,0,1200');
  });
  it('neutralises formulas hidden behind tabs or carriage returns', () => {
    expect(toCsv([['\t=1+1']]).startsWith("'")).toBe(true);
    expect(toCsv([['\r=1+1']])).toBe('"\'\r=1+1"');
  });
  it('still neutralises plain formula text', () => {
    expect(toCsv([['=HYPERLINK("x")', '+1', '@a']])).toBe('"\'=HYPERLINK(""x"")",\'+1,\'@a');
  });
});

describe('receipt HTML', () => {
  it('escapes even the number if the data repo was tampered with', () => {
    const p = {
      id: 'p', studentId: 's', forMonth: '2026-10', amount: 5, paidOn: '2026-10-03', mode: 'cash',
      receipt: { number: '<img src=x onerror=alert(1)>', issuedOn: '2026-10-03', studentName: 'A', amount: 5, forMonth: '2026-10', balanceAfter: 0, voided: false },
    } as unknown as Payment;
    const html = receiptHtml(p, { teacherName: 'T', tuitionName: 'T' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
