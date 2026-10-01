import { useState } from 'preact/hooks';
import type { PayMode, Payment, Student } from '../domain/types';
import { addMonths, monthLabel, monthOf, todayISO } from '../domain/dates';
import { balanceFor } from '../domain/fees';
import { formatRupees, parseRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import type { Settings } from '../app/settings';
import { reminderLink, reminderMessage } from '../reports/reminder';
import { Errors, Field, val } from './common';
import { useLoad } from './hooks';
import { ReceiptView } from './ReceiptView';

export function FeesScreen({ store, settings }: { store: DataStore; settings: Settings }) {
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: students } = useLoad(() => store.students(), [store]);
  const { data: payments, reload } = useLoad(() => store.payments(month), [store, month]);

  const MonthNav = (
    <div class="row between month-nav">
      <button class="btn small" type="button" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
      <strong>{monthLabel(month)}</strong>
      <button class="btn small" type="button" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>›</button>
    </div>
  );

  const open = (students ?? []).find((s) => s.id === openId);
  if (open && payments) {
    return <StudentFees store={store} settings={settings} student={open} month={month} payments={payments} onBack={() => setOpenId(null)} onChanged={reload} />;
  }

  const active = (students ?? []).filter((s) => s.active || (payments ?? []).some((p) => p.studentId === s.id));
  const rows = active
    .map((s) => ({ s, balance: balanceFor(s, month, payments ?? []) }))
    .sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || a.s.name.localeCompare(b.s.name));
  const pendingTotal = rows.filter((r) => r.s.active).reduce((n, r) => n + Math.max(r.balance, 0), 0);
  const collected = (payments ?? []).filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);

  return (
    <div class="screen">
      <h2>Fees</h2>
      {MonthNav}
      <div class="summary">
        <div><span class="muted">Collected</span><strong>{formatRupees(collected)}</strong></div>
        <div><span class="muted">To collect</span><p class="pending-total">{formatRupees(pendingTotal)} pending</p></div>
      </div>
      {students && rows.length === 0 && <p class="muted">No students yet.</p>}
      <ul class="list">
        {rows.map(({ s, balance }) => (
          <li key={s.id}>
            <button type="button" class="row-button" onClick={() => setOpenId(s.id)}>
              <span><strong>{s.name}</strong> <span class="muted">Class {s.grade}</span></span>
              <span class={balance > 0 ? 'due' : 'paid'}>{balance > 0 ? `${formatRupees(balance)} pending` : 'Paid'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudentFees(props: {
  store: DataStore; settings: Settings; student: Student; month: string; payments: Payment[]; onBack: () => void; onChanged: () => void;
}) {
  const { store, settings, student, month, payments, onBack, onChanged } = props;
  const mine = payments.filter((p) => p.studentId === student.id);
  const balance = balanceFor(student, month, payments);
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [mode, setMode] = useState<PayMode>('cash');
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  async function record(e: Event) {
    e.preventDefault();
    const n = parseRupees(amount);
    if (n === null) return setErrors(['Enter an amount above zero']);
    try {
      const p = await store.recordPayment({ studentId: student.id, forMonth: month, amount: n, paidOn, mode });
      setErrors([]);
      setAmount('');
      onChanged();
      setReceipt(p);
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  async function confirmVoid(p: Payment) {
    try {
      await store.voidReceipt(p.id, month, reason);
      setVoiding(null);
      setReason('');
      setErrors([]);
      onChanged();
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  const link = balance > 0 ? reminderLink(student.guardianPhone, reminderMessage(student, month, balance, settings.teacherName || 'your teacher')) : null;

  return (
    <div class="screen">
      <button class="btn ghost" type="button" onClick={onBack}>‹ All students</button>
      <h2>{student.name}</h2>
      <p class="muted">{monthLabel(month)} · fee {formatRupees(student.monthlyFee)} · {balance > 0 ? `${formatRupees(balance)} pending` : balance < 0 ? `${formatRupees(-balance)} extra paid` : 'fully paid'}</p>
      {link && <a class="btn" href={link} target="_blank" rel="noopener noreferrer">Remind on WhatsApp</a>}

      <form onSubmit={record} class="card">
        <h3>Record payment</h3>
        <Field label="Amount (₹)"><input value={amount} onInput={(e) => setAmount(val(e))} inputMode="numeric" autoComplete="off" /></Field>
        <Field label="Date paid"><input type="date" value={paidOn} max={todayISO()} onInput={(e) => setPaidOn(val(e))} /></Field>
        <Field label="Mode">
          <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as PayMode)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Errors errors={errors} />
        <button class="btn primary" type="submit">Record payment</button>
      </form>

      <h3>Payments this month</h3>
      {mine.length === 0 && <p class="muted">No payments yet.</p>}
      <ul class="list">
        {mine.map((p) => (
          <li key={p.id} class={p.receipt.voided ? 'inactive' : ''}>
            <span>
              Receipt #{p.receipt.number} · {formatRupees(p.amount)} · {p.paidOn}{p.receipt.voided ? ' · VOID' : ''}
            </span>
            <span class="row">
              <button class="btn small" type="button" aria-label={`View receipt #${p.receipt.number}`} onClick={() => setReceipt(p)}>View</button>
              {!p.receipt.voided && <button class="btn small ghost" type="button" aria-label={`Void receipt #${p.receipt.number}`} onClick={() => setVoiding(p.id)}>Void</button>}
            </span>
            {voiding === p.id && (
              <div class="void-form">
                <Field label="Reason for voiding"><input value={reason} onInput={(e) => setReason(val(e))} autoComplete="off" /></Field>
                <div class="row">
                  <button class="btn danger" type="button" onClick={() => confirmVoid(p)}>Confirm void</button>
                  <button class="btn ghost" type="button" onClick={() => { setVoiding(null); setReason(''); setErrors([]); }}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {receipt && <ReceiptView payment={receipt} settings={settings} onClose={() => setReceipt(null)} />}
    </div>
  );
}
