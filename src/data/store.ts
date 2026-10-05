import type { AttendanceFile, ISODate, Mark, Meta, MonthKey, PayMode, Payment, PaymentsFile, Student, StudentsFile, Teacher, TeachersFile, Visit, VisitsFile } from '../domain/types';
import { isValidISODate, monthOf, monthsInRange } from '../domain/dates';
import { nextId } from '../domain/fees';
import { validatePayment, validateStudent, validateTeacher, validateVisit } from '../domain/validate';
import type { LocalStore } from '../sync/local';

const STUDENTS = 'students.json';
const META = 'meta.json';
const attendancePath = (m: MonthKey) => `attendance/${m}.json`;
const paymentsPath = (m: MonthKey) => `payments/${m}.json`;
const TEACHERS = 'teachers.json';
const visitsPath = (m: MonthKey) => `visits/${m}.json`;

export interface PaymentInput { studentId: string; forMonth: MonthKey; amount: number; paidOn: ISODate; mode: PayMode }
export interface VisitInput { teacherId: string; date: ISODate; hours: number; amount: number; note: string }
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

  /** Atomic read-modify-write: two saves at the same instant can never overwrite each other. */
  private async mutate<T>(path: string, fallback: T, fn: (cur: T) => T): Promise<T> {
    let result!: T;
    await this.local.update(path, (e) => {
      const next = fn(e ? (JSON.parse(e.content) as T) : fallback);
      result = next;
      return { content: JSON.stringify(next, null, 2), sha: e?.sha, dirty: true };
    });
    this.onChange();
    return result;
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

    let payment!: Payment;
    await this.mutate<PaymentsFile>(paymentsPath(input.forMonth), { payments: [] }, (f) => {
      // The balance is worked out inside the same atomic step that stores the payment.
      const alreadyPaid = f.payments.filter((p) => p.studentId === student.id && !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
      payment = {
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
      return { payments: [...f.payments, payment] };
    });
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

  // ---- visiting teachers (paid per visit)

  async teachers(): Promise<Teacher[]> {
    return (await this.load<TeachersFile>(TEACHERS, { teachers: [] })).teachers;
  }

  async saveTeacher(input: Omit<Teacher, 'id' | 'updatedAt'> & { id?: string }): Promise<Teacher> {
    const teacher: Teacher = { ...input, id: input.id ?? nextId(), updatedAt: new Date().toISOString() };
    const errs = validateTeacher(teacher);
    if (errs.length) throw new Error(errs.map((e) => e.message).join('. '));
    await this.mutate<TeachersFile>(TEACHERS, { teachers: [] }, (f) => {
      const exists = f.teachers.some((t) => t.id === teacher.id);
      return { teachers: exists ? f.teachers.map((t) => (t.id === teacher.id ? teacher : t)) : [...f.teachers, teacher] };
    });
    return teacher;
  }

  async setTeacherActive(id: string, active: boolean): Promise<void> {
    const t = (await this.teachers()).find((x) => x.id === id);
    if (!t) throw new Error('Teacher not found');
    await this.saveTeacher({ ...t, active });
  }

  /** Visits of a month, newest first. Deleted visits are hidden here but kept in the file. */
  async visits(month: MonthKey): Promise<Visit[]> {
    const file = await this.load<VisitsFile>(visitsPath(month), { visits: [] });
    return file.visits
      .filter((v) => !v.deleted)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  }

  async visitMonths(): Promise<MonthKey[]> {
    const months: MonthKey[] = [];
    for (const m of await this.monthsOf('visits/')) if ((await this.visits(m)).length) months.push(m);
    return months;
  }

  async recordVisit(input: VisitInput): Promise<Visit> {
    const visit: Visit = { ...input, id: nextId(), deleted: false, updatedAt: new Date().toISOString() };
    const errs = validateVisit(visit);
    if (errs.length) throw new Error(errs.map((e) => e.message).join('. '));
    if (!(await this.teachers()).some((t) => t.id === visit.teacherId)) throw new Error('Teacher not found');
    await this.mutate<VisitsFile>(visitsPath(monthOf(visit.date)), { visits: [] }, (f) => ({ visits: [...f.visits, visit] }));
    return visit;
  }

  /** Edit a visit. Changing the date to another month moves it between month files (added first, then removed, so a crash never loses it). */
  async updateVisit(id: string, month: MonthKey, patch: Partial<Pick<Visit, 'teacherId' | 'date' | 'hours' | 'amount' | 'note'>>): Promise<Visit> {
    const current = (await this.visits(month)).find((v) => v.id === id);
    if (!current) throw new Error('Visit not found');
    const next: Visit = { ...current, ...patch, updatedAt: new Date().toISOString() };
    const errs = validateVisit(next);
    if (errs.length) throw new Error(errs.map((e) => e.message).join('. '));
    if (!(await this.teachers()).some((t) => t.id === next.teacherId)) throw new Error('Teacher not found');
    const newMonth = monthOf(next.date);
    if (newMonth === month) {
      await this.mutate<VisitsFile>(visitsPath(month), { visits: [] }, (f) => ({ visits: f.visits.map((v) => (v.id === id ? next : v)) }));
    } else {
      await this.mutate<VisitsFile>(visitsPath(newMonth), { visits: [] }, (f) => ({ visits: [...f.visits.filter((v) => v.id !== id), next] }));
      await this.mutate<VisitsFile>(visitsPath(month), { visits: [] }, (f) => ({
        visits: f.visits.map((v) => (v.id === id ? { ...v, deleted: true, updatedAt: next.updatedAt } : v)),
      }));
    }
    return next;
  }

  async deleteVisit(id: string, month: MonthKey): Promise<void> {
    const exists = (await this.visits(month)).some((v) => v.id === id);
    if (!exists) throw new Error('Visit not found');
    await this.mutate<VisitsFile>(visitsPath(month), { visits: [] }, (f) => ({
      visits: f.visits.map((v) => (v.id === id ? { ...v, deleted: true, updatedAt: new Date().toISOString() } : v)),
    }));
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
    const reject = () => new Error('This is not a YOURS Tuition backup file');
    let parsed: BackupFile;
    try {
      parsed = JSON.parse(text) as BackupFile;
    } catch {
      throw reject();
    }
    if (parsed?.app !== 'yours-tuition' || typeof parsed.files !== 'object' || parsed.files === null || Array.isArray(parsed.files)) throw reject();

    // Check everything first. Only the app's own files are accepted, so a doctored backup cannot write elsewhere.
    const checked: [string, string, Record<string, unknown>][] = [];
    for (const [path, content] of Object.entries(parsed.files)) {
      if (!ALLOWED_PATH.test(path) || typeof content !== 'string' || content.length > MAX_FILE_CHARS) throw reject();
      let doc: unknown;
      try {
        doc = JSON.parse(content);
      } catch {
        throw reject();
      }
      if (!hasExpectedShape(path, doc)) throw reject();
      checked.push([path, content, doc as Record<string, unknown>]);
    }

    // Never let a restored counter reuse a receipt number that is already on a restored payment.
    let highest = 0;
    for (const [path, , doc] of checked) {
      if (path.startsWith('payments/')) for (const p of doc.payments as Payment[]) highest = Math.max(highest, Number(p?.receipt?.number) || 0);
    }
    const files = new Map(checked.map(([p, c]) => [p, c]));
    const metaDoc = (checked.find(([p]) => p === META)?.[2] ?? { schemaVersion: 1, nextReceiptNumber: 1 }) as unknown as Meta;
    if (highest > 0 || files.has(META)) {
      files.set(META, JSON.stringify({ ...metaDoc, nextReceiptNumber: Math.max(metaDoc.nextReceiptNumber, highest + 1) }, null, 2));
    }

    const existing = await this.local.all();
    for (const [path, content] of files) {
      await this.local.put(path, { content, sha: existing[path]?.sha, dirty: true });
    }
    this.onChange();
  }
}

const ALLOWED_PATH = /^(students\.json|meta\.json|teachers\.json|(attendance|payments|visits)\/\d{4}-(0[1-9]|1[0-2])\.json)$/;
const MAX_FILE_CHARS = 5_000_000;

function hasExpectedShape(path: string, doc: unknown): boolean {
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return false;
  const d = doc as Record<string, unknown>;
  if (path === STUDENTS) return Array.isArray(d.students);
  if (path === META) return Number.isInteger(d.nextReceiptNumber) && (d.nextReceiptNumber as number) >= 1;
  if (path === TEACHERS) return Array.isArray(d.teachers);
  if (path.startsWith('visits/')) return Array.isArray(d.visits);
  if (path.startsWith('attendance/')) return typeof d.days === 'object' && d.days !== null && !Array.isArray(d.days);
  return Array.isArray(d.payments);
}
