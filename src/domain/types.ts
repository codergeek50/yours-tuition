export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

export interface Student {
  id: string;
  name: string;
  school: string;
  grade: string;
  guardianName: string;
  guardianPhone: string;
  monthlyFee: number; // whole rupees
  joinedOn: ISODate;
  active: boolean;
  updatedAt: string; // ISO timestamp, used to merge conflicting edits
}

export type Mark = 'P' | 'A' | 'L';

export interface Receipt {
  number: number;
  issuedOn: ISODate;
  studentName: string;
  amount: number;
  forMonth: MonthKey;
  balanceAfter: number;
  voided: boolean;
  voidReason?: string;
}

export type PayMode = 'cash' | 'upi' | 'bank' | 'other';

export interface Payment {
  id: string;
  studentId: string;
  forMonth: MonthKey;
  amount: number;
  paidOn: ISODate;
  mode: PayMode;
  receipt: Receipt;
}

export interface StudentsFile { students: Student[] }
export interface AttendanceFile {
  days: Record<ISODate, Record<string, Mark>>;
  /** Days with no class for everyone, by name. An empty name means the holiday was removed (kept so a sync cannot bring it back). */
  holidays?: Record<ISODate, string>;
}
export interface PaymentsFile { payments: Payment[] }
export interface Meta { schemaVersion: 1; nextReceiptNumber: number }

export interface FieldError { field: string; message: string }

/** A teacher who comes in on specific days and is paid per visit. */
export interface Teacher {
  id: string;
  name: string;
  phone: string;
  subject: string;
  usualAmount: number; // whole rupees; only pre-fills a new visit
  active: boolean;
  updatedAt: string;
}

/** One day a teacher came in: hours worked and the amount paid. Deleted visits are kept (flagged) so merges stay correct. */
export interface Visit {
  id: string;
  teacherId: string;
  date: ISODate;
  hours: number; // quarter-hour steps, above 0 and at most 24
  amount: number; // whole rupees: what was paid, or what is still owed while pending
  /** false = "pay later": recorded but not paid yet. Visits saved before this existed have no value and count as paid. */
  paid: boolean;
  /** Day the visit was paid; empty while pending. */
  paidOn: ISODate | '';
  note: string;
  deleted: boolean;
  updatedAt: string;
}

/** Money the tuition spends: rent, supplies and so on. Deleted expenses are kept (flagged) so merges stay correct. */
export interface Expense {
  id: string;
  date: ISODate;
  label: string;
  amount: number; // whole rupees, above zero
  deleted: boolean;
  updatedAt: string;
}

export interface TeachersFile { teachers: Teacher[] }
export interface ExpensesFile { expenses: Expense[] }
export interface VisitsFile { visits: Visit[] }
