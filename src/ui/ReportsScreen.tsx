import { useState } from 'preact/hooks';
import { monthOf, todayISO } from '../domain/dates';
import { formatRupees } from '../domain/money';
import { balanceFor } from '../domain/fees';
import type { DataStore } from '../data/store';
import { attendanceCsv, attendanceSummary, feeReportCsv } from '../reports/csv';
import { Field, PageHeader, val } from './common';
import { downloadText, useLoad } from './hooks';
import { MonthNav } from './FeesScreen';
import { IconDownload } from './icons';

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
  const feeStudents = sorted.filter((s) => s.active || (payments ?? []).some((p) => p.studentId === s.id));
  const collected = (payments ?? []).filter((p) => !p.receipt.voided).reduce((n, p) => n + p.amount, 0);
  const pending = sorted.filter((s) => s.active).reduce((n, s) => n + Math.max(balanceFor(s, month, payments ?? []), 0), 0);

  return (
    <div class="screen">
      <PageHeader title="Reports" sub="Download as CSV for Excel or Google Sheets" />

      <section class="card">
        <h3>Attendance</h3>
        <div class="row">
          <Field label="From"><input type="date" value={from} max={to} onInput={(e) => setFrom(val(e))} /></Field>
          <Field label="To"><input type="date" value={to} max={today} onInput={(e) => setTo(val(e))} /></Field>
        </div>
        {days && days.length === 0 && <p class="muted">No attendance recorded in this period.</p>}
        {days && days.length > 0 && (
          <>
            <table class="table">
              <thead><tr><th>Student</th><th>Present</th><th>Absent</th><th>Leave</th><th>%</th></tr></thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.student.id}>
                    <td>{r.student.name}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.leave}</td><td>{r.percent ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p class="muted small">{days.length} day(s) recorded in this period.</p>
          </>
        )}
        <button class="btn primary wide" type="button" disabled={!days || days.length === 0}
          onClick={() => downloadText(`attendance_${from}_to_${to}.csv`, attendanceCsv(inRange, days ?? []))}>
          <IconDownload size={20} /> Download attendance CSV
        </button>
      </section>

      <section class="card">
        <h3>Fees</h3>
        <MonthNav month={month} onChange={setMonth} suffix=" for fees report" />
        <div class="stats two">
          <div class="stat"><span>Collected</span><b>{formatRupees(collected)}</b></div>
          <div class="stat"><span>Still to collect</span><b>{formatRupees(pending)}</b></div>
        </div>
        <button class="btn primary wide" type="button" disabled={!students}
          onClick={() => downloadText(`fees_${month}.csv`, feeReportCsv(feeStudents, month, payments ?? []))}>
          <IconDownload size={20} /> Download fees CSV
        </button>
      </section>
    </div>
  );
}
