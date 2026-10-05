import type { Teacher, Visit } from './types';

/** Parse typed hours: "2", "1.5", "1,5". Quarter-hour steps, above 0 and at most 24. Returns null if not acceptable. */
export function parseHours(text: string): number | null {
  const cleaned = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return isValidHours(n) ? n : null;
}

export function isValidHours(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n <= 24 && Math.abs(n * 4 - Math.round(n * 4)) < 1e-9;
}

export function formatHours(n: number): string {
  return `${Number.isInteger(n) ? n : String(n)} h`;
}

export interface TeacherSummaryRow { teacher: Teacher; visits: number; hours: number; paid: number }
export interface VisitSummary { rows: TeacherSummaryRow[]; totals: { visits: number; hours: number; paid: number } }

/** Visits, hours and money per teacher for the visits given (deleted visits never count). Only teachers who visited appear. */
export function visitSummary(teachers: Teacher[], visits: Visit[]): VisitSummary {
  const byTeacher = new Map<string, TeacherSummaryRow>();
  for (const v of visits) {
    if (v.deleted) continue;
    const teacher = teachers.find((t) => t.id === v.teacherId);
    if (!teacher) continue;
    const row = byTeacher.get(teacher.id) ?? { teacher, visits: 0, hours: 0, paid: 0 };
    row.visits += 1;
    row.hours += v.hours;
    row.paid += v.amount;
    byTeacher.set(teacher.id, row);
  }
  const rows = [...byTeacher.values()].sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));
  return {
    rows,
    totals: rows.reduce((t, r) => ({ visits: t.visits + r.visits, hours: t.hours + r.hours, paid: t.paid + r.paid }), { visits: 0, hours: 0, paid: 0 }),
  };
}
