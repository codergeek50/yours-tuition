import { describe, it, expect } from 'vitest';
import { attendanceCsv, attendanceSummary, type AttendanceDay } from './csv';
import type { Student } from '../domain/types';

const s = (id: string, name: string): Student => ({ id, name, school: 'X', grade: 'III', guardianName: '', guardianPhone: '', monthlyFee: 600, joinedOn: '2026-01-01', active: true, updatedAt: '' });
const students = [s('a', 'Asha')];
const days: AttendanceDay[] = [
  { date: '2026-10-19', marks: { a: 'P' as const } },
  { date: '2026-10-20', marks: {}, holiday: 'Diwali' },
  { date: '2026-10-21', marks: { a: 'A' as const } },
];

describe('holidays in the attendance report', () => {
  it('a holiday is not counted as absent, present or in the percentage', () => {
    const [row] = attendanceSummary(students, days);
    expect(row).toMatchObject({ present: 1, absent: 1, leave: 0, total: 2, percent: 50 });
  });

  it('even a day with marks is skipped when it is a holiday', () => {
    const [row] = attendanceSummary(students, [{ date: '2026-10-20', marks: { a: 'A' as const }, holiday: 'Diwali' }]);
    expect(row).toMatchObject({ present: 0, absent: 0, total: 0, percent: null });
  });

  it('the CSV shows H on the holiday column', () => {
    const lines = attendanceCsv(students, days).split('\r\n');
    expect(lines[0]).toBe('Name,Class,School,2026-10-19,2026-10-20,2026-10-21,Present,Absent,Leave,Attendance %');
    expect(lines[1]).toBe('Asha,III,X,P,H,A,1,1,0,50');
  });
});
