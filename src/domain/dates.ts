import type { ISODate, MonthKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function todayISO(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function isValidISODate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidMonth(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function monthOf(date: ISODate): MonthKey {
  return date.slice(0, 7);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthLabel(month: MonthKey): string {
  const [y, m] = month.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

export function monthsInRange(from: ISODate, to: ISODate): MonthKey[] {
  if (from > to) return [];
  const out: MonthKey[] = [];
  let cur = monthOf(from);
  const last = monthOf(to);
  while (cur <= last) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}
