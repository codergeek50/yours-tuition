import { describe, it, expect } from 'vitest';
import { expensesCsv } from './csv';
import type { Expense } from '../domain/types';

const e = (id: string, date: string, label: string, amount: number, deleted = false): Expense => ({ id, date, label, amount, deleted, updatedAt: '' });

describe('expenses CSV', () => {
  it('lists expenses oldest first with a total, and leaves deleted ones out', () => {
    const csv = expensesCsv([e('2', '2026-10-12', 'Chalk', 150), e('1', '2026-10-05', 'Rent', 4000), e('3', '2026-10-06', 'Old', 99, true)]).split('\r\n');
    expect(csv).toEqual(['Date,What,Amount', '2026-10-05,Rent,4000', '2026-10-12,Chalk,150', 'Total,,4150']);
  });
  it('neutralises text that a spreadsheet would run as a formula', () => {
    expect(expensesCsv([e('1', '2026-10-05', '=SUM(1,1)', 10)]).split('\r\n')[1]).toBe('2026-10-05,"\'=SUM(1,1)",10');
  });
});
