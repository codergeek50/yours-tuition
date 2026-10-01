import { useEffect, useState } from 'preact/hooks';
import type { Mark } from '../domain/types';
import { monthOf, todayISO } from '../domain/dates';
import type { DataStore } from '../data/store';
import { Avatar, Empty, Field, PageHeader, val } from './common';
import { useLoad } from './hooks';
import { IconCheck, IconLeft, IconMinus, IconRight, IconX } from './icons';

const NEXT: Record<Mark, Mark> = { P: 'A', A: 'L', L: 'P' };
const LABEL: Record<Mark, string> = { P: 'Present', A: 'Absent', L: 'Leave' };
const MarkIcon = { P: IconCheck, A: IconX, L: IconMinus };

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(y, m - 1, d + delta);
  return todayISO(dt);
}

function friendly(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const text = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  if (iso === today) return `Today, ${text}`;
  if (iso === shiftDay(today, -1)) return `Yesterday, ${text}`;
  return text;
}

export function AttendanceScreen({ store }: { store: DataStore }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const { data: students } = useLoad(() => store.students(), [store]);
  const { data: month, reload } = useLoad(() => store.attendance(monthOf(date)), [store, date]);
  // Only the teacher's changes are kept in state; everyone else shows saved marks, or Present by default.
  const [edits, setEdits] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const active = (students ?? []).filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name));
  const existing = month?.days[date];
  const markOf = (id: string): Mark => edits[id] ?? existing?.[id] ?? 'P';

  useEffect(() => {
    setEdits({});
    setSaved(false);
  }, [date]);

  async function save() {
    try {
      await store.saveAttendance(date, { ...(existing ?? {}), ...Object.fromEntries(active.map((x) => [x.id, markOf(x.id)])) });
      setSaved(true);
      setError('');
      reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const count = (m: Mark) => active.filter((s) => markOf(s.id) === m).length;

  return (
    <div class="screen">
      <PageHeader title="Attendance" sub={friendly(date, today)} />

      <div class="datebar">
        <button type="button" class="icon-btn" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><IconLeft /></button>
        <Field label="Date" hideLabel><input type="date" value={date} max={today} onInput={(e) => setDate(val(e) || today)} /></Field>
        <button type="button" class="icon-btn" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><IconRight /></button>
      </div>

      {existing && !saved && <p class="note">Attendance is already taken for this day. You can change it.</p>}

      {students && month && active.length === 0 && (
        <Empty title="No students yet" text="Add your students first, then come back to take attendance." />
      )}

      {month && active.length > 0 && (
        <>
          <div class="counts" aria-label="Totals">
            <div class="count count-P"><b>{count('P')}</b><span>Present</span></div>
            <div class="count count-A"><b>{count('A')}</b><span>Absent</span></div>
            <div class="count count-L"><b>{count('L')}</b><span>Leave</span></div>
          </div>

          <ul class="list">
            {active.map((s) => {
              const m = markOf(s.id);
              const Icon = MarkIcon[m];
              return (
                <li key={s.id}>
                  <Avatar name={s.name} />
                  <div class="item-main">
                    <span class="item-name">{s.name}</span>
                    <span class="item-meta">Class {s.grade}</span>
                  </div>
                  <button
                    type="button"
                    class={`mark mark-${m}`}
                    aria-label={`${s.name}: ${LABEL[m]}`}
                    onClick={() => { setSaved(false); setEdits((cur) => ({ ...cur, [s.id]: NEXT[m] })); }}
                  >
                    <Icon size={18} />
                    {LABEL[m]}
                  </button>
                </li>
              );
            })}
          </ul>
          <p class="muted small">Everyone starts as present. Tap a name to mark absent, then leave.</p>

          <div class="savebar">
            {saved && <span class="ok" role="status"><IconCheck size={18} /> Saved</span>}
            {error && <p class="errors" role="alert">{error}</p>}
            <button class="btn primary wide" type="button" onClick={save}>Save attendance</button>
          </div>
        </>
      )}
    </div>
  );
}
