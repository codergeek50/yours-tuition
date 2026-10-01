import { useState } from 'preact/hooks';
import type { Mark } from '../domain/types';
import { addMonths, monthOf, todayISO } from '../domain/dates';
import { formatRupees } from '../domain/money';
import { balanceFor } from '../domain/fees';
import type { DataStore } from '../data/store';
import { attendanceCsv, attendanceSummary, feeReportCsv } from '../reports/csv';
import { Field, PageHeader, val } from './common';
import { downloadText, useLoad } from './hooks';
import { MonthNav } from './FeesScreen';
import { IconDownload } from './icons';

const pad = (n: number) => String(n).padStart(2, '0');

/** First and last calendar day of a month key like 2026-10. */
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { from: `${month}-01`, to: `${month}-${pad(new Date(y, m, 0).getDate())}` };
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (iso: string) => Number(iso.slice(8, 10));
const monthAbbr = (iso: string) => MONTH_ABBR[Number(iso.slice(5, 7)) - 1] ?? '';
const WORD: Record<Mark, string> = { P: 'Present', A: 'Absent', L: 'Leave' };

export function ReportsScreen({ store }: { store: DataStore }) {
  const today = todayISO();
  const thisMonth = monthOf(today);
  const [from, setFrom] = useState(monthRange(thisMonth).from);
  const [to, setTo] = useState(monthRange(thisMonth).to);
  const [month, setMonth] = useState(thisMonth);
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

  const setRange = (m: string) => {
    const r = monthRange(m);
    setFrom(r.from);
    setTo(r.to);
  };

  return (
    <div class="screen">
      <PageHeader title="Reports" sub="Download as CSV for Excel or Google Sheets" />

      <section class="card">
        <h3>Attendance</h3>
        <div class="row">
          <Field label="From"><input type="date" value={from} max={to} onInput={(e) => setFrom(val(e))} /></Field>
          <Field label="To"><input type="date" value={to} min={from} onInput={(e) => setTo(val(e))} /></Field>
        </div>
        <div class="row">
          <button class="btn small" type="button" onClick={() => setRange(thisMonth)}>This month</button>
          <button class="btn small" type="button" onClick={() => setRange(addMonths(thisMonth, -1))}>Last month</button>
        </div>

        {days && days.length === 0 && <p class="muted">No attendance recorded in this period.</p>}
        {days && days.length > 0 && (
          <>
            <p class="muted small">{days.length} day(s) recorded. Scroll sideways to see every date.</p>
            <div class="matrix-wrap" role="region" aria-label="Attendance by date" tabIndex={0}>
              <table class="matrix">
                <thead>
                  <tr>
                    <th scope="col" class="m-name">Student</th>
                    {days.map((d) => (
                      <th key={d.date} scope="col" class="m-date" aria-label={`${dayOf(d.date)} ${monthAbbr(d.date)}`}>
                        <b>{dayOf(d.date)}</b>
                        <span>{monthAbbr(d.date)}</span>
                      </th>
                    ))}
                    <th scope="col" class="m-sum">P</th>
                    <th scope="col" class="m-sum">A</th>
                    <th scope="col" class="m-sum">L</th>
                    <th scope="col" class="m-sum">%</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r) => (
                    <tr key={r.student.id}>
                      <th scope="row" class="m-name">{r.student.name}</th>
                      {days.map((d) => {
                        const mk = d.marks[r.student.id];
                        return mk ? (
                          <td key={d.date} class={`m-cell m-${mk}`} title={WORD[mk]}>{mk}</td>
                        ) : (
                          <td key={d.date} class="m-cell m-none" title="Not recorded">·</td>
                        );
                      })}
                      <td class="m-sum">{r.present}</td>
                      <td class="m-sum">{r.absent}</td>
                      <td class="m-sum">{r.leave}</td>
                      <td class="m-sum">{r.percent ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="muted small">P present, A absent, L leave, a dot means not recorded that day.</p>
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
