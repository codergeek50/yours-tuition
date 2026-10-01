import { useEffect, useState } from 'preact/hooks';
import type { Mark, Student } from '../domain/types';
import { monthOf, todayISO } from '../domain/dates';
import type { DataStore } from '../data/store';
import { Avatar, Empty, val } from './common';
import { useLoad } from './hooks';
import { IconCalendar, IconCheck, IconChevronDown, IconLeft, IconRight } from './icons';

const NEXT: Record<Mark, Mark> = { P: 'A', A: 'L', L: 'P' };
const LABEL: Record<Mark, string> = { P: 'Present', A: 'Absent', L: 'Leave' };
const LETTER: Record<Mark, string> = { P: 'P', A: 'A', L: 'L' };

function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return todayISO(new Date(y, m - 1, d + delta));
}

function friendly(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const sameYear = y === Number(today.slice(0, 4));
  const text = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
  if (iso === today) return `Today, ${text}`;
  if (iso === shiftDay(today, -1)) return `Yesterday, ${text}`;
  return text;
}

/** Students grouped under their first letter, like a school register. */
function groupByLetter(students: Student[]): [string, Student[]][] {
  const groups = new Map<string, Student[]>();
  for (const s of students) {
    const letter = (s.name.trim()[0] ?? '#').toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), s]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function AttendanceScreen({ store }: { store: DataStore }) {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [grade, setGrade] = useState('');
  const { data: students } = useLoad(() => store.students(), [store]);
  const { data: month, reload } = useLoad(() => store.attendance(monthOf(date)), [store, date]);
  // Only the teacher's changes are kept in state; everyone else shows saved marks, or Present by default.
  const [edits, setEdits] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const active = (students ?? []).filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name));
  const grades = [...new Set(active.map((s) => s.grade))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const shown = grade ? active.filter((s) => s.grade === grade) : active;
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

  const count = (m: Mark) => shown.filter((s) => markOf(s.id) === m).length;

  return (
    <div class="att">
      <div class="filterbar">
        <div class="fb-item fb-date">
          <button type="button" class="fb-step" aria-label="Previous day" onClick={() => setDate(shiftDay(date, -1))}><IconLeft size={20} /></button>
          <label class="fb-pick">
            <span class="sr-only">Date</span>
            <IconCalendar size={20} />
            <span>{friendly(date, today)}</span>
            <input type="date" value={date} max={today} onInput={(e) => setDate(val(e) || today)} />
          </label>
          <button type="button" class="fb-step" aria-label="Next day" disabled={date >= today} onClick={() => setDate(shiftDay(date, 1))}><IconRight size={20} /></button>
        </div>
        <label class="fb-item fb-class">
          <span class="sr-only">Class</span>
          <select value={grade} onChange={(e) => setGrade((e.target as HTMLSelectElement).value)}>
            <option value="">All classes</option>
            {grades.map((g) => <option key={g} value={g}>Class {g}</option>)}
          </select>
          <IconChevronDown size={18} />
        </label>
      </div>

      <div class="screen">
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

            {groupByLetter(shown).map(([letter, group]) => (
              <section key={letter} class="letter-group" aria-label={`Students starting with ${letter}`}>
                <h3 class="letter">{letter}</h3>
                <ul class="cards">
                  {group.map((s) => {
                    const m = markOf(s.id);
                    return (
                      <li key={s.id} class="acard">
                        <div class="acard-main">
                          <Avatar name={s.name} />
                          <div class="item-main">
                            <span class="item-name">{s.name}</span>
                            <span class="item-meta">Class {s.grade}{s.school ? ` · ${s.school}` : ''}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          class={`mark mark-${m}`}
                          aria-label={`${s.name}: ${LABEL[m]}`}
                          onClick={() => { setSaved(false); setEdits((cur) => ({ ...cur, [s.id]: NEXT[m] })); }}
                        >
                          <b>{LETTER[m]}</b>
                          <span>{LABEL[m]}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {shown.length === 0 && <p class="muted">No students in this class.</p>}
            <p class="muted small">Everyone starts as present. Tap the coloured box beside a name to mark absent, then leave.</p>

            <div class="savebar">
              {saved && <span class="ok" role="status"><IconCheck size={18} /> Saved</span>}
              {error && <p class="errors" role="alert">{error}</p>}
              <button class="btn primary wide" type="button" onClick={save}>Save attendance</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
