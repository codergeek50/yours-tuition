import { useState } from 'preact/hooks';
import { addMonths, monthLabel, monthOf, todayISO } from '../domain/dates';
import { formatRupees } from '../domain/money';
import { balanceFor } from '../domain/fees';
import type { DataStore } from '../data/store';
import { attendanceCsv, attendanceSummary, feeReportCsv } from '../reports/csv';
import { Field, val } from './common';
import { downloadText, useLoad } from './hooks';

export function ReportsScreen({ store }: { store: DataStore }) {
  const today = todayISO();
  const [from, setFrom] = useState(`${monthOf(today)}-01`);
  const [to, setTo] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const { data: students } = useLoad(() => store.students(), [store]);
  const { data: days } = useLoad(() => store.attendanceRange(from, to), [store, from, to]);
  const { data: payments } = useLoad(() => store.payments(month), [store, month]);

  const sorted = [...(students ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  // Only students who were on the roll in the range: active, or with marks in the range.
  const inRange = sorted.filter((s) => s.active || (days ?? []).some((d) => d.marks[s.id]));
  const summary = attendanceSummary(inRange, days ?? []);

  return (
    <div class="screen">
      <h2>Reports</h2>

      <section class="card">
        <h3>Attendance</h3>
        <div class="row">
          <Field label="From"><input type="date" value={from} max={to} onInput={(e) => setFrom(val(e))} /></Field>
          <Field label="To"><input type="date" value={to} max={today} onInput={(e) => setTo(val(e))} /></Field>
        </div>
        {days && days.length === 0 && <p class="muted">No attendance recorded in this period.</p>}
        {days && days.length > 0 && (
          <table class="table">
            <thead><tr><th>Student</th><th>P</th><th>A</th><th>L</th><th>%</th></tr></thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.student.id}>
                  <td>{r.student.name}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.leave}</td><td>{r.percent ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p class="muted small">P present, A absent, L leave. {days ? `${days.length} day(s) recorded.` : ''}</p>
        <button class="btn primary" type="button" disabled={!days || days.length === 0}
          onClick={() => downloadText(`attendance_${from}_to_${to}.csv`, attendanceCsv(inRange, days ?? []))}>
          Download attendance CSV
        </button>
      </section>

      <section class="card">
        <h3>Fees</h3>
        <div class="row between month-nav">
          <button class="btn small" type="button" aria-label="Previous month for fees report" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
          <strong>{monthLabel(month)}</strong>
          <button class="btn small" type="button" aria-label="Next month for fees report" onClick={() => setMonth(addMonths(month, 1))}>›</button>
        </div>
        <p class="muted">
          Collected {formatRupees((payments ?? []).filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0))} · Pending{' '}
          {formatRupees(sorted.filter((s) => s.active).reduce((n, s) => n + Math.max(balanceFor(s, month, payments ?? []), 0), 0))}
        </p>
        <button class="btn primary" type="button" disabled={!students}
          onClick={() => downloadText(`fees_${month}.csv`, feeReportCsv(sorted.filter((s) => s.active || (payments ?? []).some((p) => p.studentId === s.id)), month, payments ?? []))}>
          Download fees CSV
        </button>
      </section>
    </div>
  );
}
