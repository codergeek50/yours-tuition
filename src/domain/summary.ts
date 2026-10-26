import { normalizeVisit } from './teachers';
import type { Expense, Payment, Visit } from './types';

export interface MonthlyNet {
  /** Fees received for the month (voided receipts left out). */
  collected: number;
  /** Visiting teachers already paid. */
  teachersPaid: number;
  /** Visiting teachers still to be paid; shown beside the net, not taken off it. */
  teachersPending: number;
  expenses: number;
  /** collected - teachersPaid - expenses */
  net: number;
}

/** What came in and went out in one month, from that month's payments, visits and expenses. */
export function monthlyNet(payments: Payment[], visits: Visit[], expenses: Expense[]): MonthlyNet {
  const collected = payments.filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
  const live = visits.filter((v) => !v.deleted).map(normalizeVisit);
  const teachersPaid = live.filter((v) => v.paid).reduce((n, v) => n + v.amount, 0);
  const teachersPending = live.filter((v) => !v.paid).reduce((n, v) => n + v.amount, 0);
  const spent = expenses.filter((x) => !x.deleted).reduce((n, x) => n + x.amount, 0);
  return { collected, teachersPaid, teachersPending, expenses: spent, net: collected - teachersPaid - spent };
}
