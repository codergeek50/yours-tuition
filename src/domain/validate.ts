import type { Expense, FieldError, Student, Payment, Teacher, Visit } from './types';
import { isValidHours } from './teachers';
import { isValidISODate, isValidMonth } from './dates';

export function validateStudent(s: Student): FieldError[] {
  const errs: FieldError[] = [];
  if (!s.name.trim()) errs.push({ field: 'name', message: 'Name is required' });
  if (!s.grade.trim()) errs.push({ field: 'grade', message: 'Class (school grade) is required' });
  if (!Number.isInteger(s.monthlyFee) || s.monthlyFee < 0) {
    errs.push({ field: 'monthlyFee', message: 'Monthly fee must be a whole number of rupees' });
  }
  const phone = s.guardianPhone.replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{10,13}$/.test(phone)) {
    errs.push({ field: 'guardianPhone', message: 'Phone number looks wrong' });
  }
  return errs;
}

export function validatePayment(p: Pick<Payment, 'amount' | 'paidOn' | 'forMonth'>): FieldError[] {
  const errs: FieldError[] = [];
  if (!Number.isInteger(p.amount) || p.amount <= 0) errs.push({ field: 'amount', message: 'Enter an amount above zero' });
  if (!isValidISODate(p.paidOn)) errs.push({ field: 'paidOn', message: 'Date is not valid' });
  if (!isValidMonth(p.forMonth)) errs.push({ field: 'forMonth', message: 'Month is not valid' });
  return errs;
}

export function validateTeacher(t: Teacher): FieldError[] {
  const errs: FieldError[] = [];
  if (!t.name.trim()) errs.push({ field: 'name', message: 'Name is required' });
  const phone = t.phone.replace(/[\s-]/g, '');
  if (phone && !/^\+?\d{10,13}$/.test(phone)) errs.push({ field: 'phone', message: 'Phone number looks wrong' });
  if (!Number.isInteger(t.usualAmount) || t.usualAmount < 0) errs.push({ field: 'usualAmount', message: 'Usual amount must be a whole number of rupees' });
  return errs;
}

export function validateVisit(v: Visit): FieldError[] {
  const errs: FieldError[] = [];
  if (!v.teacherId) errs.push({ field: 'teacherId', message: 'Choose the teacher' });
  if (!isValidISODate(v.date)) errs.push({ field: 'date', message: 'Date is not valid' });
  if (!isValidHours(v.hours)) errs.push({ field: 'hours', message: 'Hours must be above 0 and at most 24, in steps of 0.25' });
  if (!Number.isInteger(v.amount) || v.amount < 0) errs.push({ field: 'amount', message: 'Amount must be a whole number of rupees' });
  if (v.paid && !isValidISODate(v.paidOn)) errs.push({ field: 'paidOn', message: 'Paid date is not valid' });
  return errs;
}

export function validateExpense(x: Pick<Expense, 'date' | 'label' | 'amount'>): FieldError[] {
  const errs: FieldError[] = [];
  if (!x.label.trim()) errs.push({ field: 'label', message: 'Say what the money was for' });
  if (x.label.length > 80) errs.push({ field: 'label', message: 'Keep it under 80 letters' });
  if (!Number.isInteger(x.amount) || x.amount <= 0) errs.push({ field: 'amount', message: 'Amount must be a whole number of rupees above zero' });
  if (!isValidISODate(x.date)) errs.push({ field: 'date', message: 'Date is not valid' });
  return errs;
}
