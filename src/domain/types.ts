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
export interface AttendanceFile { days: Record<ISODate, Record<string, Mark>> }
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
  amount: number; // whole rupees paid
  note: string;
  deleted: boolean;
  updatedAt: string;
}

export interface TeachersFile { teachers: Teacher[] }
export interface VisitsFile { visits: Visit[] }
