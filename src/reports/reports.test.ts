import { describe, it, expect } from 'vitest';
import { toCsv, attendanceSummary, attendanceCsv, feeReportCsv, type AttendanceDay } from './csv';
import { reminderLink, reminderMessage } from './reminder';
import { receiptHtml } from './receipt';
import type { Payment, Student } from '../domain/types';

const stu = (id: string, name: string, o: Partial<Student> = {}): Student => ({
  id, name, school: 'St Mary', grade: '8', guardianName: 'Ravi', guardianPhone: '9876543210',
  monthlyFee: 1000, joinedOn: '2026-08-05', active: true, updatedAt: '', ...o,
});
const pay = (o: Partial<Payment> = {}): Payment => ({
  id: 'p1', studentId: 'a', forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'cash',
  receipt: { number: 7, issuedOn: '2026-10-03', studentName: 'Asha', amount: 400, forMonth: '2026-10', balanceAfter: 600, voided: false }, ...o,
});

describe('toCsv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv([['a,b', 'say "hi"', 'x\ny']])).toBe('"a,b","say ""hi""","x\ny"');
  });
  it('neutralises spreadsheet formulas', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-2', '@x', 'ok']])).toBe("'=SUM(A1),'+1,'-2,'@x,ok");
  });
  it('joins rows with CRLF', () => {
    expect(toCsv([['a'], ['b']])).toBe('a\r\nb');
  });
});

describe('attendance', () => {
  const students = [stu('a', 'Asha'), stu('b', 'Bala')];
  const days: AttendanceDay[] = [
    { date: '2026-10-01', marks: { a: 'P', b: 'A' } },
    { date: '2026-10-02', marks: { a: 'P', b: 'L' } },
    { date: '2026-10-03', marks: { a: 'A' } },
  ];

  it('summarises present, absent, leave and percentage per student', () => {
    const s = attendanceSummary(students, days);
    expect(s.find((x) => x.student.id === 'a')).toMatchObject({ present: 2, absent: 1, leave: 0, total: 3, percent: 67 });
    expect(s.find((x) => x.student.id === 'b')).toMatchObject({ present: 0, absent: 1, leave: 1, total: 2, percent: 0 });
  });
  it('gives null percent when nothing was recorded', () => {
    expect(attendanceSummary([stu('c', 'C')], days)[0]!.percent).toBeNull();
  });
  it('builds a CSV with one column per day', () => {
    const csv = attendanceCsv(students, days);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Class,School,2026-10-01,2026-10-02,2026-10-03,Present,Absent,Leave,Attendance %');
    expect(lines[1]).toBe('Asha,8,St Mary,P,P,A,2,1,0,67');
    expect(lines[2]).toBe('Bala,8,St Mary,A,L,,0,1,1,0');
  });
});

describe('fee report', () => {
  it('lists fee, paid, balance and receipt numbers, excluding voided payments from paid', () => {
    const voided = pay({ id: 'p2', amount: 300, receipt: { ...pay().receipt, number: 8, voided: true } });
    const csv = feeReportCsv([stu('a', 'Asha'), stu('b', 'Bala')], '2026-10', [pay(), voided]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Name,Class,Monthly fee,Paid,Balance,Receipts');
    expect(lines[1]).toBe('Asha,8,1000,400,600,#7');
    expect(lines[2]).toBe('Bala,8,1000,0,1000,');
  });
});

describe('reminder', () => {
  it('builds a wa.me link, adding 91 to 10-digit numbers', () => {
    const link = reminderLink('98765 43210', 'Hi there');
    expect(link).toBe('https://wa.me/919876543210?text=Hi%20there');
  });
  it('keeps numbers that already have a country code', () => {
    expect(reminderLink('+14155550123', 'x')).toContain('wa.me/14155550123');
  });
  it('returns null when there is no usable number', () => {
    expect(reminderLink('', 'x')).toBeNull();
    expect(reminderLink('12', 'x')).toBeNull();
  });
  it('writes a polite message with month and balance', () => {
    const m = reminderMessage(stu('a', 'Asha', { guardianName: 'Ravi' }), '2026-10', 600, 'Mr Kumar');
    expect(m).toContain('Asha');
    expect(m).toContain('October 2026');
    expect(m).toContain('₹600');
    expect(m).toContain('Mr Kumar');
  });
});

describe('receiptHtml', () => {
  it('includes number, month, date, student, amount and balance', () => {
    const html = receiptHtml(pay(), { teacherName: 'Mr Kumar', tuitionName: 'Kumar Tuition' });
    for (const s of ['Receipt No. 7', 'October 2026', '2026-10-03', 'Asha', '₹400', '₹600', 'Mr Kumar', 'Kumar Tuition']) {
      expect(html).toContain(s);
    }
  });
  it('escapes HTML in names', () => {
    const p = pay({ receipt: { ...pay().receipt, studentName: '<script>alert(1)</script>' } });
    const html = receiptHtml(p, { teacherName: 'T', tuitionName: 'T' });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
  it('marks voided receipts clearly', () => {
    const p = pay({ receipt: { ...pay().receipt, voided: true, voidReason: 'wrong amount' } });
    const html = receiptHtml(p, { teacherName: 'T', tuitionName: 'T' });
    expect(html).toContain('VOID');
    expect(html).toContain('wrong amount');
  });
});
