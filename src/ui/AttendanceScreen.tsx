import { useEffect, useState } from 'preact/hooks';
import type { Mark } from '../domain/types';
import { monthOf, todayISO } from '../domain/dates';
import type { DataStore } from '../data/store';
import { Field, val } from './common';
import { useLoad } from './hooks';

const NEXT: Record<Mark, Mark> = { P: 'A', A: 'L', L: 'P' };
const LABEL: Record<Mark, string> = { P: 'Present', A: 'Absent', L: 'Leave' };

export function AttendanceScreen({ store }: { store: DataStore }) {
  const [date, setDate] = useState(todayISO());
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
      <h2>Attendance</h2>
      <Field label="Date"><input type="date" value={date} max={todayISO()} onInput={(e) => setDate(val(e) || todayISO())} /></Field>
      {existing && !saved && <p class="note">Attendance already taken for this day. You can change it.</p>}
      {students && month && active.length === 0 && <p class="muted">No active students. Add students first.</p>}
      <ul class="list tight">
        {month && active.map((s) => {
          const m = markOf(s.id);
          return (
            <li key={s.id}>
              <span>{s.name} <span class="muted">· Class {s.grade}</span></span>
              <button type="button" class={`mark mark-${m}`} aria-label={`${s.name}: ${LABEL[m]}`} onClick={() => { setSaved(false); setEdits((cur) => ({ ...cur, [s.id]: NEXT[m] })); }}>
                {LABEL[m]}
              </button>
            </li>
          );
        })}
      </ul>
      {month && active.length > 0 && (
        <div class="sticky-bar">
          <span class="muted">Present {count('P')} · Absent {count('A')} · Leave {count('L')}</span>
          <button class="btn primary" type="button" onClick={save}>Save attendance</button>
        </div>
      )}
      {saved && <p class="ok" role="status">Saved</p>}
      {error && <p class="errors" role="alert">{error}</p>}
    </div>
  );
}
