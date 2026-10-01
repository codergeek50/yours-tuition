import type { MonthKey, Student } from '../domain/types';
import { monthLabel } from '../domain/dates';
import { formatRupees } from '../domain/money';

/** wa.me click-to-chat link. No API, no cost. Returns null without a usable number. */
export function reminderLink(phone: string, message: string): string | null {
  const digits = phone.replace(/[^\d]/g, '');
  const full = digits.length === 10 ? `91${digits}` : digits.length >= 11 && digits.length <= 13 ? digits : '';
  if (!full) return null;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

export function reminderMessage(student: Student, month: MonthKey, balance: number, teacherName: string): string {
  return `Hello ${student.guardianName || 'there'}, a gentle reminder that ${student.name}'s tuition fee for ${monthLabel(month)} has ${formatRupees(balance)} pending. Thank you. - ${teacherName}`;
}
