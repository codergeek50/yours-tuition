import type { MonthKey, Student } from '../domain/types';
import { monthLabel } from '../domain/dates';
import { formatRupees } from '../domain/money';
import { whatsappLink } from './whatsapp';

/** wa.me click-to-chat link for a fee reminder. Returns null without a usable number. */
export function reminderLink(phone: string, message: string): string | null {
  return whatsappLink(phone, message);
}

export function reminderMessage(student: Student, month: MonthKey, balance: number, teacherName: string): string {
  return `Hello ${student.guardianName || 'there'}, a gentle reminder that ${student.name}'s tuition fee for ${monthLabel(month)} has ${formatRupees(balance)} pending. Thank you. - ${teacherName}`;
}
