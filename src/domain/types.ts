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
