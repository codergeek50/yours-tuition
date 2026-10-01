import { describe, it, expect } from 'vitest';
import { parseRupees, formatRupees } from './money';
import { todayISO, monthOf, isValidISODate, monthsInRange, monthLabel, addMonths } from './dates';
import { validateStudent, validatePayment } from './validate';
import { balanceFor, studentsPendingForMonth, nextId } from './fees';
import type { Student, Payment } from './types';

const student = (o: Partial<Student> = {}): Student => ({
  id: 's1', name: 'Asha', school: 'St Mary', grade: '8', guardianName: 'Ravi', guardianPhone: '9876543210',
  monthlyFee: 1000, joinedOn: '2026-08-05', active: true, updatedAt: '2026-08-05T00:00:00Z', ...o,
});
const payment = (o: Partial<Payment> = {}): Payment => ({
  id: 'p1', studentId: 's1', forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'cash',
  receipt: { number: 1, issuedOn: '2026-10-03', studentName: 'Asha', amount: 400, forMonth: '2026-10', balanceAfter: 600, voided: false }, ...o,
});

describe('money', () => {
  it('parses whole rupees', () => {
    expect(parseRupees('1500')).toBe(1500);
    expect(parseRupees(' 1,500 ')).toBe(1500);
    expect(parseRupees('₹2000')).toBe(2000);
  });
  it('rejects bad input', () => {
    expect(parseRupees('')).toBeNull();
    expect(parseRupees('abc')).toBeNull();
    expect(parseRupees('-5')).toBeNull();
    expect(parseRupees('12.5')).toBeNull();
    expect(parseRupees('0')).toBeNull();
  });
  it('formats with Indian grouping', () => {
    expect(formatRupees(150000)).toBe('₹1,50,000');
    expect(formatRupees(0)).toBe('₹0');
  });
});

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('26-02-01')).toBe(false);
  });
  it('derives month keys and labels', () => {
    expect(monthOf('2026-10-03')).toBe('2026-10');
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(todayISO(new Date(2026, 9, 1))).toBe('2026-10-01');
  });
  it('lists months in a range, inclusive', () => {
    expect(monthsInRange('2026-11-15', '2027-01-02')).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(monthsInRange('2026-10-03', '2026-10-20')).toEqual(['2026-10']);
    expect(monthsInRange('2026-10-20', '2026-10-03')).toEqual([]);
  });
  it('adds months across year ends', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });
});

describe('validate', () => {
  it('accepts a good student', () => {
    expect(validateStudent(student())).toEqual([]);
  });
  it('flags missing name, grade and bad fee/phone', () => {
    const errs = validateStudent(student({ name: ' ', grade: '', monthlyFee: -1, guardianPhone: '12' }));
    expect(errs.map((e) => e.field).sort()).toEqual(['grade', 'guardianPhone', 'monthlyFee', 'name']);
  });
  it('allows empty guardian phone but not a malformed one', () => {
    expect(validateStudent(student({ guardianPhone: '' }))).toEqual([]);
  });
  it('validates payments', () => {
    expect(validatePayment({ amount: 500, paidOn: '2026-10-03', forMonth: '2026-10' })).toEqual([]);
    expect(validatePayment({ amount: 0, paidOn: 'x', forMonth: '2026-13' }).length).toBe(3);
  });
});

describe('fees', () => {
  it('balance subtracts non-voided payments only', () => {
    const voided = payment({ id: 'p2', amount: 300, receipt: { ...payment().receipt, number: 2, voided: true } });
    expect(balanceFor(student(), '2026-10', [payment(), voided])).toBe(600);
  });
  it('balance is zero before the student joined', () => {
    expect(balanceFor(student({ joinedOn: '2026-11-01' }), '2026-10', [])).toBe(0);
  });
  it('overpayment gives a negative balance', () => {
    expect(balanceFor(student(), '2026-10', [payment({ amount: 1500 })])).toBe(-500);
  });
  it('lists pending students for a month, active ones only', () => {
    const students = [student(), student({ id: 's2', name: 'B' }), student({ id: 's3', active: false })];
    const paid = payment({ studentId: 's2', amount: 1000 });
    const pending = studentsPendingForMonth(students, '2026-10', [paid]);
    expect(pending.map((p) => p.student.id)).toEqual(['s1']);
    expect(pending[0]!.balance).toBe(1000);
  });
  it('generates unique ids', () => {
    expect(nextId()).not.toBe(nextId());
  });
});
