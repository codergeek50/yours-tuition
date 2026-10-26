import type { Expense, ISODate, Mark, MonthKey, Payment, Student, Teacher, Visit } from '../domain/types';
import { normalizeVisit, visitSummary } from '../domain/teachers';
import { balanceFor } from '../domain/fees';
import type { MonthlyNet } from '../domain/summary';

/** Quote cells for CSV and neutralise spreadsheet formulas (= + - @) typed into names or schools. */
function cell(v: string | number): string {
  let s = String(v);
  // Real numbers are written as they are (a balance of -500 must stay -500); only text can be a formula.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

export interface AttendanceDay { date: ISODate; marks: Record<string, Mark>; holiday?: string }

export function attendanceSummary(students: Student[], days: AttendanceDay[]) {
  return students.map((student) => {
    let present = 0, absent = 0, leave = 0;
    for (const d of days) {
      if (d.holiday) continue; // no class that day, so nobody is counted
      const m = d.marks[student.id];
      if (m === 'P') present++;
      else if (m === 'A') absent++;
      else if (m === 'L') leave++;
    }
    const total = present + absent + leave;
    return { student, present, absent, leave, total, percent: total ? Math.round((present / total) * 100) : null };
  });
}

export function attendanceCsv(students: Student[], days: AttendanceDay[]): string {
  const header = ['Name', 'Class', 'School', ...days.map((d) => d.date), 'Present', 'Absent', 'Leave', 'Attendance %'];
  const summary = attendanceSummary(students, days);
  const rows = summary.map((s) => [
    s.student.name,
    s.student.grade,
    s.student.school,
    ...days.map((d) => (d.holiday ? 'H' : d.marks[s.student.id] ?? '')),
    s.present,
    s.absent,
    s.leave,
    s.percent ?? '',
  ]);
  return toCsv([header, ...rows]);
}

export function feeReportCsv(students: Student[], month: MonthKey, payments: Payment[]): string {
  const header = ['Name', 'Class', 'Monthly fee', 'Paid', 'Balance', 'Receipts'];
  const rows = students.map((s) => {
    const mine = payments.filter((p) => p.studentId === s.id && p.forMonth === month);
    const paid = mine.filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
    return [
      s.name,
      s.grade,
      s.monthlyFee,
      paid,
      balanceFor(s, month, payments),
      mine.filter((p) => !p.receipt.voided).map((p) => `#${p.receipt.number}`).join(' '),
    ];
  });
  return toCsv([header, ...rows]);
}

/** Every visit in the list, oldest first, with its status and paid date, then paid, pending and total rows. Deleted visits are left out. */
export function visitsCsv(teachers: Teacher[], visits: Visit[]): string {
  const live = visits
    .filter((v) => !v.deleted)
    .map(normalizeVisit)
    .sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  const rows = live.map((v) => {
    const t = teachers.find((x) => x.id === v.teacherId);
    return [v.date, t?.name ?? 'Unknown teacher', t?.subject ?? '', v.hours, v.amount, v.paid ? 'Paid' : 'Pending', v.paidOn, v.note];
  });
  const hours = live.reduce((n, v) => n + v.hours, 0);
  const paid = live.filter((v) => v.paid).reduce((n, v) => n + v.amount, 0);
  const pending = live.filter((v) => !v.paid).reduce((n, v) => n + v.amount, 0);
  return toCsv([
    ['Date', 'Teacher', 'Subject', 'Hours', 'Amount', 'Status', 'Paid on', 'Note'],
    ...rows,
    ['Total', '', '', hours, paid + pending, '', '', ''],
    ['Paid', '', '', '', paid, '', '', ''],
    ['Pending', '', '', '', pending, '', '', ''],
  ]);
}

/** One row per teacher who visited, with visits, hours, paid, pending and total, plus a grand total. */
export function visitSummaryCsv(teachers: Teacher[], visits: Visit[]): string {
  const { rows, totals } = visitSummary(teachers, visits);
  return toCsv([
    ['Teacher', 'Subject', 'Visits', 'Hours', 'Paid', 'Pending', 'Total'],
    ...rows.map((r) => [r.teacher.name, r.teacher.subject, r.visits, r.hours, r.paid, r.pending, r.paid + r.pending]),
    ['Total', '', totals.visits, totals.hours, totals.paid, totals.pending, totals.paid + totals.pending],
  ]);
}

/** Every expense in the list, oldest first, with a total. Deleted expenses are left out. */
export function expensesCsv(expenses: Expense[]): string {
  const live = expenses.filter((x) => !x.deleted).sort((a, b) => a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt));
  const total = live.reduce((n, x) => n + x.amount, 0);
  return toCsv([['Date', 'What', 'Amount'], ...live.map((x) => [x.date, x.label, x.amount]), ['Total', '', total]]);
}

/** One month's money in and out: fees collected, teachers paid, expenses and the net. */
export function monthlyNetCsv(month: MonthKey, n: MonthlyNet): string {
  return toCsv([
    ['Month', month],
    ['Fees collected', n.collected],
    ['Visiting teachers paid', n.teachersPaid],
    ['Expenses', n.expenses],
    ['Net', n.net],
    ['Visiting teachers still to pay', n.teachersPending],
  ]);
}
