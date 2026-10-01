import type { AttendanceFile, ISODate, Mark, Meta, MonthKey, PayMode, Payment, PaymentsFile, Student, StudentsFile } from '../domain/types';
import { isValidISODate, monthOf, monthsInRange } from '../domain/dates';
import { nextId } from '../domain/fees';
import { validatePayment, validateStudent } from '../domain/validate';
import type { LocalStore } from '../sync/local';

const STUDENTS = 'students.json';
const META = 'meta.json';
const attendancePath = (m: MonthKey) => `attendance/${m}.json`;
const paymentsPath = (m: MonthKey) => `payments/${m}.json`;

export interface PaymentInput { studentId: string; forMonth: MonthKey; amount: number; paidOn: ISODate; mode: PayMode }
export interface BackupFile { app: 'yours-tuition'; version: 1; exportedAt: string; files: Record<string, string> }

/**
 * All reads and writes go to the local working copy; every write marks the file dirty
 * and calls onChange so the app can sync in the background.
 */
export class DataStore {
  private local: LocalStore;
  private onChange: () => void;

  constructor(local: LocalStore, onChange: () => void = () => {}) {
    this.local = local;
    this.onChange = onChange;
  }

  private async load<T>(path: string, fallback: T): Promise<T> {
    const e = await this.local.get(path);
    return e ? (JSON.parse(e.content) as T) : fallback;
  }

  private async mutate<T>(path: string, fallback: T, fn: (cur: T) => T): Promise<T> {
    const e = await this.local.get(path);
    const next = fn(e ? (JSON.parse(e.content) as T) : fallback);
    await this.local.put(path, { content: JSON.stringify(next, null, 2), sha: e?.sha, dirty: true });
    this.onChange();
    return next;
  }

  // ---- students

  async students(): Promise<Student[]> {
    return (await this.load<StudentsFile>(STUDENTS, { students: [] })).students;
  }

  async saveStudent(input: Omit<Student, 'id' | 'updatedAt'> & { id?: string }): Promise<Student> {
    const student: Student = { ...input, id: input.id ?? nextId(), updatedAt: new Date().toISOString() };
    const errs = validateStudent(student);
    if (errs.length) throw new Error(errs.map((e) => e.message).join('. '));
    await this.mutate<StudentsFile>(STUDENTS, { students: [] }, (f) => {
      const exists = f.students.some((s) => s.id === student.id);
      return { students: exists ? f.students.map((s) => (s.id === student.id ? student : s)) : [...f.students, student] };
    });
    return student;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const s = (await this.students()).find((x) => x.id === id);
    if (!s) throw new Error('Student not found');
    await this.saveStudent({ ...s, active });
  }

  // ---- attendance

  async attendance(month: MonthKey): Promise<AttendanceFile> {
    return this.load<AttendanceFile>(attendancePath(month), { days: {} });
  }

  async saveAttendance(date: ISODate, marks: Record<string, Mark>): Promise<void> {
    if (!isValidISODate(date)) throw new Error('Attendance date is not valid');
    await this.mutate<AttendanceFile>(attendancePath(monthOf(date)), { days: {} }, (f) => ({ days: { ...f.days, [date]: { ...marks } } }));
  }

  async attendanceRange(from: ISODate, to: ISODate): Promise<{ date: ISODate; marks: Record<string, Mark> }[]> {
    const out: { date: ISODate; marks: Record<string, Mark> }[] = [];
    for (const m of monthsInRange(from, to)) {
      const f = await this.attendance(m);
      for (const [date, marks] of Object.entries(f.days)) if (date >= from && date <= to) out.push({ date, marks });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---- payments and receipts

  async payments(month: MonthKey): Promise<Payment[]> {
    return (await this.load<PaymentsFile>(paymentsPath(month), { payments: [] })).payments;
  }

  async paymentMonths(): Promise<MonthKey[]> {
    return this.monthsOf('payments/');
  }

  async attendanceMonths(): Promise<MonthKey[]> {
    return this.monthsOf('attendance/');
  }

  private async monthsOf(prefix: string): Promise<MonthKey[]> {
    const all = await this.local.all();
    return Object.keys(all)
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length, -'.json'.length))
      .sort();
  }

  async recordPayment(input: PaymentInput): Promise<Payment> {
    const errs = validatePayment(input);
    if (errs.length) throw new Error(errs.map((e) => e.message).join('. '));
    const student = (await this.students()).find((s) => s.id === input.studentId);
    if (!student) throw new Error('Student not found');

    // Counter first: if the payments write is lost, a number is skipped, never reused.
    const meta = await this.mutate<Meta>(META, { schemaVersion: 1, nextReceiptNumber: 1 }, (m) => ({ ...m, nextReceiptNumber: m.nextReceiptNumber + 1 }));
    const number = meta.nextReceiptNumber - 1;

    const existing = await this.payments(input.forMonth);
    const alreadyPaid = existing.filter((p) => p.studentId === student.id && !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
    const payment: Payment = {
      id: nextId(),
      studentId: student.id,
      forMonth: input.forMonth,
      amount: input.amount,
      paidOn: input.paidOn,
      mode: input.mode,
      receipt: {
        number,
        issuedOn: input.paidOn,
        studentName: student.name,
        amount: input.amount,
        forMonth: input.forMonth,
        balanceAfter: student.monthlyFee - alreadyPaid - input.amount,
        voided: false,
      },
    };
    await this.mutate<PaymentsFile>(paymentsPath(input.forMonth), { payments: [] }, (f) => ({ payments: [...f.payments, payment] }));
    return payment;
  }

  /** Receipts are never edited or deleted: a mistake is voided with a reason, then reissued as a new payment. */
  async voidReceipt(paymentId: string, forMonth: MonthKey, reason: string): Promise<void> {
    if (!reason.trim()) throw new Error('A reason is required to void a receipt');
    const found = (await this.payments(forMonth)).some((p) => p.id === paymentId);
    if (!found) throw new Error('Payment not found');
    await this.mutate<PaymentsFile>(paymentsPath(forMonth), { payments: [] }, (f) => ({
      payments: f.payments.map((p) => (p.id === paymentId ? { ...p, receipt: { ...p.receipt, voided: true, voidReason: reason.trim() } } : p)),
    }));
  }

  async findReceipt(number: number): Promise<Payment | undefined> {
    for (const m of await this.paymentMonths()) {
      const hit = (await this.payments(m)).find((p) => p.receipt.number === number);
      if (hit) return hit;
    }
    return undefined;
  }

  // ---- backup and restore

  async exportAll(): Promise<string> {
    const all = await this.local.all();
    const files = Object.fromEntries(Object.entries(all).map(([p, e]) => [p, e.content]));
    const backup: BackupFile = { app: 'yours-tuition', version: 1, exportedAt: new Date().toISOString(), files };
    return JSON.stringify(backup, null, 2);
  }

  /** Replaces the working copy with the backup and marks every file for upload. */
  async importAll(text: string): Promise<void> {
    let parsed: BackupFile;
    try {
      parsed = JSON.parse(text) as BackupFile;
    } catch {
      throw new Error('This is not a YOURS Tuition backup file');
    }
    if (parsed?.app !== 'yours-tuition' || typeof parsed.files !== 'object' || parsed.files === null) {
      throw new Error('This is not a YOURS Tuition backup file');
    }
    const existing = await this.local.all();
    for (const [path, content] of Object.entries(parsed.files)) {
      await this.local.put(path, { content, sha: existing[path]?.sha, dirty: true });
    }
    this.onChange();
  }
}
