import { useState } from 'preact/hooks';
import type { Student } from '../domain/types';
import { todayISO } from '../domain/dates';
import { validateStudent } from '../domain/validate';
import { formatRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import { Errors, Field, val } from './common';
import { useLoad } from './hooks';

type Draft = Omit<Student, 'id' | 'updatedAt'> & { id?: string; fee: string };

const blank = (): Draft => ({
  name: '', school: '', grade: '', guardianName: '', guardianPhone: '', monthlyFee: 0, fee: '', joinedOn: todayISO(), active: true,
});

export function StudentsScreen({ store }: { store: DataStore }) {
  const { data: students, reload } = useLoad(() => store.students(), [store]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const set = (k: keyof Draft, v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  async function save(e: Event) {
    e.preventDefault();
    if (!draft) return;
    const feeText = draft.fee.replace(/[₹,\s]/g, '');
    const { fee: _fee, ...rest } = draft;
    const candidate = { ...rest, monthlyFee: feeText === '' ? 0 : Number(feeText) };
    const errs = validateStudent({ ...candidate, id: candidate.id ?? 'new', updatedAt: '' });
    if (errs.length) return setErrors(errs.map((x) => x.message));
    try {
      await store.saveStudent(candidate);
      setDraft(null);
      setErrors([]);
      reload();
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  if (draft) {
    return (
      <form class="screen" onSubmit={save}>
        <h2>{draft.id ? 'Edit student' : 'Add student'}</h2>
        <Field label="Name"><input value={draft.name} onInput={(e) => set('name', val(e))} autoComplete="off" /></Field>
        <Field label="School"><input value={draft.school} onInput={(e) => set('school', val(e))} autoComplete="off" /></Field>
        <Field label="Class"><input value={draft.grade} onInput={(e) => set('grade', val(e))} inputMode="numeric" autoComplete="off" /></Field>
        <Field label="Guardian name"><input value={draft.guardianName} onInput={(e) => set('guardianName', val(e))} autoComplete="off" /></Field>
        <Field label="Guardian phone"><input value={draft.guardianPhone} onInput={(e) => set('guardianPhone', val(e))} inputMode="tel" autoComplete="off" /></Field>
        <Field label="Monthly fee (₹)"><input value={draft.fee} onInput={(e) => set('fee', val(e))} inputMode="numeric" autoComplete="off" /></Field>
        <Field label="Joined on"><input type="date" value={draft.joinedOn} onInput={(e) => set('joinedOn', val(e))} /></Field>
        <Errors errors={errors} />
        <div class="row">
          <button class="btn primary" type="submit">Save student</button>
          <button class="btn ghost" type="button" onClick={() => { setDraft(null); setErrors([]); }}>Cancel</button>
        </div>
      </form>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = (students ?? [])
    .filter((s) => (showInactive ? true : s.active))
    .filter((s) => !q || `${s.name} ${s.school} ${s.grade}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div class="screen">
      <div class="row between">
        <h2>Students</h2>
        <button class="btn primary" type="button" onClick={() => setDraft(blank())}>Add student</button>
      </div>
      <Field label="Search students"><input type="search" value={query} onInput={(e) => setQuery(val(e))} /></Field>
      <label class="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive((e.target as HTMLInputElement).checked)} /> Show inactive</label>
      {students && shown.length === 0 && <p class="muted">{students.length ? 'No match.' : 'No students yet. Tap Add student to begin.'}</p>}
      <ul class="list">
        {shown.map((s) => (
          <li key={s.id} class={s.active ? '' : 'inactive'}>
            <div>
              <strong>{s.name}</strong>
              <div class="muted">Class {s.grade} · {s.school || 'No school'} · {formatRupees(s.monthlyFee)}/month</div>
            </div>
            <div class="row">
              <button class="btn small" type="button" onClick={() => setDraft({ ...s, fee: String(s.monthlyFee) })}>Edit</button>
              <button class="btn small ghost" type="button" onClick={async () => { await store.setActive(s.id, !s.active); reload(); }}>
                {s.active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
