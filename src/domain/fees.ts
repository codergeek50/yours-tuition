import type { MonthKey, Payment, Student } from './types';
import { monthOf } from './dates';

/** Amount still owed by a student for a month. Voided receipts do not count. Zero before joining. */
export function balanceFor(student: Student, month: MonthKey, payments: Payment[]): number {
  if (monthOf(student.joinedOn) > month) return 0;
  const paid = payments
    .filter((p) => p.studentId === student.id && p.forMonth === month && !p.receipt.voided)
    .reduce((sum, p) => sum + p.amount, 0);
  return student.monthlyFee - paid;
}

export function studentsPendingForMonth(students: Student[], month: MonthKey, payments: Payment[]) {
  return students
    .filter((s) => s.active)
    .map((student) => ({ student, balance: balanceFor(student, month, payments) }))
    .filter((r) => r.balance > 0);
}

export function nextId(): string {
  return crypto.randomUUID();
}
