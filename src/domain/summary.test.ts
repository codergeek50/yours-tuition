import { describe, it, expect } from 'vitest';
import { monthlyNet } from './summary';
import { monthlyNetCsv } from '../reports/csv';
import type { Expense, Payment, Visit } from './types';

const pay = (amount: number, voided = false): Payment => ({ id: String(amount), studentId: 's', forMonth: '2026-10', amount, paidOn: '2026-10-05', mode: 'cash', receipt: { number: 1, issuedOn: '2026-10-05', studentName: 'A', amount, forMonth: '2026-10', balanceAfter: 0, voided } });
const visit = (amount: number, o: Partial<Visit> = {}): Visit => ({ id: String(amount), teacherId: 't', date: '2026-10-03', hours: 1, amount, paid: true, paidOn: '2026-10-03', note: '', deleted: false, updatedAt: '', ...o });
const spend = (amount: number): Expense => ({ id: String(amount), date: '2026-10-05', label: 'Rent', amount, deleted: false, updatedAt: '' });

describe('monthly net', () => {
  it('is fees collected minus visiting teacher payouts minus expenses', () => {
    const n = monthlyNet([pay(10000), pay(6100)], [visit(2000), visit(3000)], [spend(4000)]);
    expect(n).toEqual({ collected: 16100, teachersPaid: 5000, teachersPending: 0, expenses: 4000, net: 7100 });
  });
  it('leaves voided receipts, pending visits and deleted visits out of the money that moved', () => {
    const n = monthlyNet([pay(500), pay(900, true)], [visit(100, { paid: false, paidOn: '' }), visit(200, { deleted: true }), visit(50)], []);
    expect(n).toEqual({ collected: 500, teachersPaid: 50, teachersPending: 100, expenses: 0, net: 450 });
  });
  it('can be negative', () => {
    expect(monthlyNet([], [], [spend(4000)]).net).toBe(-4000);
  });
  it('treats visits saved before pay-later existed as paid', () => {
    const old = { ...visit(700) } as Partial<Visit>;
    delete old.paid;
    delete old.paidOn;
    expect(monthlyNet([], [old as Visit], []).teachersPaid).toBe(700);
  });
});

describe('monthly net CSV', () => {
  it('lists each line and the net', () => {
    const csv = monthlyNetCsv('2026-10', { collected: 16100, teachersPaid: 5000, teachersPending: 300, expenses: 4000, net: 7100 }).split('\r\n');
    expect(csv).toEqual(['Month,2026-10', 'Fees collected,16100', 'Visiting teachers paid,5000', 'Expenses,4000', 'Net,7100', 'Visiting teachers still to pay,300']);
  });
});
