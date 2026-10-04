import type { ISODate, Mark, MonthKey, Payment, Student } from '../domain/types';
import { balanceFor } from '../domain/fees';

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

export interface AttendanceDay { date: ISODate; marks: Record<string, Mark> }

export function attendanceSummary(students: Student[], days: AttendanceDay[]) {
  return students.map((student) => {
    let present = 0, absent = 0, leave = 0;
    for (const d of days) {
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
    ...days.map((d) => d.marks[s.student.id] ?? ''),
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
