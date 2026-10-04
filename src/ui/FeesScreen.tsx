import { useRef, useState } from 'preact/hooks';
import type { PayMode, Payment, Student } from '../domain/types';
import { addMonths, monthLabel, monthOf, todayISO } from '../domain/dates';
import { balanceFor } from '../domain/fees';
import { formatRupees, parseRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import type { Settings } from '../app/settings';
import { reminderLink, reminderMessage } from '../reports/reminder';
import { Avatar, Empty, Errors, Field, PageHeader, val } from './common';
import { useLoad } from './hooks';
import { ReceiptView } from './ReceiptView';
import { IconBack, IconCheck, IconChat, IconLeft, IconReceipt, IconRight } from './icons';

export function MonthNav({ month, onChange, suffix = '' }: { month: string; onChange: (m: string) => void; suffix?: string }) {
  return (
    <div class="month-nav">
      <button class="icon-btn" type="button" aria-label={`Previous month${suffix}`} onClick={() => onChange(addMonths(month, -1))}><IconLeft /></button>
      <strong>{monthLabel(month)}</strong>
      <button class="icon-btn" type="button" aria-label={`Next month${suffix}`} onClick={() => onChange(addMonths(month, 1))}><IconRight /></button>
    </div>
  );
}

export function FeesScreen({ store, settings }: { store: DataStore; settings: Settings }) {
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: students } = useLoad(() => store.students(), [store]);
  const { data: payments, reload } = useLoad(() => store.payments(month), [store, month]);

  const open = (students ?? []).find((s) => s.id === openId);
  if (open && payments) {
    return <StudentFees store={store} settings={settings} student={open} month={month} payments={payments} onBack={() => setOpenId(null)} onChanged={reload} />;
  }

  const roster = (students ?? []).filter((s) => s.active || (payments ?? []).some((p) => p.studentId === s.id));
  const rows = roster
    .map((s) => ({ s, balance: balanceFor(s, month, payments ?? []) }))
    .sort((a, b) => Number(b.balance > 0) - Number(a.balance > 0) || a.s.name.localeCompare(b.s.name));
  const due = rows.filter((r) => r.s.active).reduce((n, r) => n + Math.max(r.balance, 0), 0);
  const collected = (payments ?? []).filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
  const total = collected + due;
  const pct = total > 0 ? Math.min(100, Math.round((collected / total) * 100)) : 0;

  return (
    <div class="screen">
      <PageHeader title="Fees" />
      <MonthNav month={month} onChange={setMonth} />

      {students && students.length > 0 && (
        <div class={due === 0 && total > 0 ? 'hero done' : 'hero'}>
          <span class="label">{due === 0 && total > 0 ? 'All fees collected this month' : 'Still to collect this month'}</span>
          <p class="pending-total">{formatRupees(due)} pending</p>
          <div class="bar" role="img" aria-label={`${pct} percent collected`}><i style={{ width: `${pct}%` }} /></div>
          <span class="sub">Collected {formatRupees(collected)} of {formatRupees(total)}</span>
        </div>
      )}

      {students && rows.length === 0 && <Empty title="No students yet" text="Add students first, then record their fees here." />}
      {rows.length > 0 && (
        <ul class="list">
          {rows.map(({ s, balance }) => {
            const part = balance > 0 && balance < s.monthlyFee;
            return (
              <li key={s.id}>
                <button type="button" class="row-button" onClick={() => setOpenId(s.id)}>
                  <Avatar name={s.name} />
                  <span class="item-main">
                    <strong class="item-name">{s.name}</strong>
                    <span class="item-meta">Class {s.grade}</span>
                  </span>
                  {balance > 0 ? (
                    <span class={part ? 'chip chip-warn' : 'chip chip-bad'}>{formatRupees(balance)} pending</span>
                  ) : (
                    <span class="chip chip-ok"><IconCheck size={16} /> Paid</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StudentFees(props: {
  store: DataStore; settings: Settings; student: Student; month: string; payments: Payment[]; onBack: () => void; onChanged: () => void;
}) {
  const { store, settings, student, month, payments, onBack, onChanged } = props;
  const mine = payments.filter((p) => p.studentId === student.id);
  const balance = balanceFor(student, month, payments);
  const paid = mine.filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
  const [amount, setAmount] = useState(balance > 0 ? String(balance) : '');
  const [paidOn, setPaidOn] = useState(todayISO());
  const [mode, setMode] = useState<PayMode>('cash');
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);

  async function record(e: Event) {
    e.preventDefault();
    if (submitting.current) return; // a double tap must not record the payment twice
    const n = parseRupees(amount);
    if (n === null) return setErrors(['Enter an amount above zero']);
    submitting.current = true;
    setBusy(true);
    try {
      const p = await store.recordPayment({ studentId: student.id, forMonth: month, amount: n, paidOn, mode });
      setErrors([]);
      setAmount('');
      onChanged();
      setReceipt(p);
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      submitting.current = false;
      setBusy(false);
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
      <div>
        <button class="btn quiet small" type="button" onClick={onBack}><IconBack size={18} /> All students</button>
      </div>
      <div class="who">
        <Avatar name={student.name} />
        <div>
          <h2>{student.name}</h2>
          <p class="muted">Class {student.grade} · {monthLabel(month)}</p>
        </div>
      </div>

      <div class="stats">
        <div class="stat"><span>Monthly fee</span><b>{formatRupees(student.monthlyFee)}</b></div>
        <div class="stat"><span>Paid</span><b>{formatRupees(paid)}</b></div>
        <div class="stat"><span>{balance < 0 ? 'Extra paid' : 'Balance'}</span><b>{formatRupees(Math.abs(balance))}</b></div>
      </div>

      {link && <a class="btn wide" href={link} target="_blank" rel="noopener noreferrer"><IconChat size={20} /> Remind on WhatsApp</a>}

      <form onSubmit={record} class="card">
        <h3>Record payment</h3>
        <Field label="Amount (₹)"><input value={amount} onInput={(e) => setAmount(val(e))} inputMode="numeric" autoComplete="off" /></Field>
        <div class="row">
          <Field label="Date paid"><input type="date" value={paidOn} max={todayISO()} onInput={(e) => setPaidOn(val(e))} /></Field>
          <Field label="Mode">
            <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as PayMode)}>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="bank">Bank</option>
              <option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Errors errors={errors} />
        <button class="btn primary wide" type="submit" disabled={busy}>Record payment</button>
      </form>

      <h3>Payments this month</h3>
      {mine.length === 0 && <Empty title="No payments yet" text="Payments you record appear here with their receipts." />}
      {mine.length > 0 && (
        <ul class="list">
          {mine.map((p) => (
            <li key={p.id} class={p.receipt.voided ? 'inactive' : ''}>
              <div class="pay-item">
                <div class="pay-top">
                  <span class="item-name">Receipt #{p.receipt.number} · {formatRupees(p.amount)} · {p.paidOn}{p.receipt.voided ? ' · VOID' : ''}</span>
                </div>
                <span class="item-meta">{p.mode.toUpperCase()}{p.receipt.voided && p.receipt.voidReason ? ` · ${p.receipt.voidReason}` : ''}</span>
                <div class="pay-actions">
                  <button class="btn small" type="button" aria-label={`View receipt #${p.receipt.number}`} onClick={() => setReceipt(p)}><IconReceipt size={18} /> View</button>
                  {!p.receipt.voided && <button class="btn small quiet" type="button" aria-label={`Void receipt #${p.receipt.number}`} onClick={() => setVoiding(p.id)}>Void</button>}
                </div>
              </div>
              {voiding === p.id && (
                <div class="void-form">
                  <Field label="Reason for voiding"><input value={reason} onInput={(e) => setReason(val(e))} autoComplete="off" /></Field>
                  <div class="row">
                    <button class="btn danger" type="button" onClick={() => confirmVoid(p)}>Confirm void</button>
                    <button class="btn" type="button" onClick={() => { setVoiding(null); setReason(''); setErrors([]); }}>Cancel</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {receipt && <ReceiptView payment={receipt} settings={settings} onClose={() => setReceipt(null)} />}
    </div>
  );
}
