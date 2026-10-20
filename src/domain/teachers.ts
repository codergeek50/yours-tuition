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

/** A visit as stored, possibly from before pay-later existed (no status): such a visit was paid, on the day it happened. */
export function normalizeVisit(raw: Omit<Visit, 'paid' | 'paidOn'> & { paid?: boolean; paidOn?: string }): Visit {
  const paid = raw.paid !== false;
  return { ...raw, paid, paidOn: paid ? raw.paidOn || raw.date : '' };
}

export interface TeacherSummaryRow { teacher: Teacher; visits: number; hours: number; paid: number; pending: number }
export interface VisitSummary { rows: TeacherSummaryRow[]; totals: { visits: number; hours: number; paid: number; pending: number } }

/** Visits, hours, money paid and money still owed per teacher (deleted visits never count). Only teachers who visited appear. */
export function visitSummary(teachers: Teacher[], visits: Visit[]): VisitSummary {
  const byTeacher = new Map<string, TeacherSummaryRow>();
  for (const raw of visits) {
    if (raw.deleted) continue;
    const v = normalizeVisit(raw);
    const teacher = teachers.find((t) => t.id === v.teacherId);
    if (!teacher) continue;
    const row = byTeacher.get(teacher.id) ?? { teacher, visits: 0, hours: 0, paid: 0, pending: 0 };
    row.visits += 1;
    row.hours += v.hours;
    if (v.paid) row.paid += v.amount;
    else row.pending += v.amount;
    byTeacher.set(teacher.id, row);
  }
  const rows = [...byTeacher.values()].sort((a, b) => a.teacher.name.localeCompare(b.teacher.name));
  return {
    rows,
    totals: rows.reduce(
      (t, r) => ({ visits: t.visits + r.visits, hours: t.hours + r.hours, paid: t.paid + r.paid, pending: t.pending + r.pending }),
      { visits: 0, hours: 0, paid: 0, pending: 0 },
    ),
  };
}
