import { useState } from 'preact/hooks';
import type { Student } from '../domain/types';
import { todayISO } from '../domain/dates';
import { validateStudent } from '../domain/validate';
import { formatRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import { Avatar, Empty, Errors, Field, PageHeader, val } from './common';
import { useLoad } from './hooks';
import { IconPlus, IconSearch } from './icons';

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
  const close = () => { setDraft(null); setErrors([]); };

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
      close();
      reload();
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  async function toggleActive() {
    if (!draft?.id) return;
    await store.setActive(draft.id, !draft.active);
    close();
    reload();
  }

  if (draft) {
    return (
      <form class="screen" onSubmit={save}>
        <PageHeader title={draft.id ? 'Edit student' : 'Add student'} />
        <div class="card">
          <Field label="Name"><input value={draft.name} onInput={(e) => set('name', val(e))} autoComplete="off" /></Field>
          <Field label="School"><input value={draft.school} onInput={(e) => set('school', val(e))} autoComplete="off" /></Field>
          <Field label="Class" hint="The school class or grade, for example 8"><input value={draft.grade} onInput={(e) => set('grade', val(e))} inputMode="numeric" autoComplete="off" /></Field>
          <Field label="Monthly fee (₹)"><input value={draft.fee} onInput={(e) => set('fee', val(e))} inputMode="numeric" autoComplete="off" /></Field>
        </div>
        <div class="card">
          <Field label="Guardian name"><input value={draft.guardianName} onInput={(e) => set('guardianName', val(e))} autoComplete="off" /></Field>
          <Field label="Guardian phone" hint="Used for WhatsApp fee reminders"><input value={draft.guardianPhone} onInput={(e) => set('guardianPhone', val(e))} inputMode="tel" autoComplete="off" /></Field>
          <Field label="Joined on"><input type="date" value={draft.joinedOn} onInput={(e) => set('joinedOn', val(e))} /></Field>
        </div>
        <Errors errors={errors} />
        <div class="form-actions">
          <button class="btn primary wide" type="submit">Save student</button>
          <button class="btn wide" type="button" onClick={close}>Cancel</button>
          {draft.id && (
            <button class="btn quiet wide" type="button" onClick={toggleActive}>
              {draft.active ? 'Mark as left (deactivate)' : 'Bring back (activate)'}
            </button>
          )}
        </div>
      </form>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = (students ?? [])
    .filter((s) => (showInactive ? true : s.active))
    .filter((s) => !q || `${s.name} ${s.school} ${s.grade}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
  const activeCount = (students ?? []).filter((s) => s.active).length;

  return (
    <div class="screen">
      <PageHeader
        title="Students"
        sub={students ? `${activeCount} active` : undefined}
        action={<button class="btn primary" type="button" onClick={() => setDraft(blank())}><IconPlus size={20} /> Add student</button>}
      />
      {students && students.length > 0 && (
        <>
          <div class="search">
            <IconSearch size={20} />
            <Field label="Search students" hideLabel><input type="search" placeholder="Search by name, school or class" value={query} onInput={(e) => setQuery(val(e))} /></Field>
          </div>
          <label class="check"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive((e.target as HTMLInputElement).checked)} /> Show students who left</label>
        </>
      )}
      {students && students.length === 0 && (
        <Empty title="No students yet" text="Add your first student to start taking attendance and fees." />
      )}
      {students && students.length > 0 && shown.length === 0 && <p class="muted">No student matches that search.</p>}
      {shown.length > 0 && (
        <ul class="list">
          {shown.map((s) => (
            <li key={s.id} class={s.active ? '' : 'inactive'}>
              <button type="button" class="row-button" aria-label={`Edit ${s.name}`} onClick={() => setDraft({ ...s, fee: String(s.monthlyFee) })}>
                <Avatar name={s.name} />
                <span class="item-main">
                  <strong class="item-name">{s.name}</strong>
                  <span class="item-meta">Class {s.grade} · {s.school || 'No school'}</span>
                </span>
                {s.active ? <span class="amount">{formatRupees(s.monthlyFee)}<span class="muted small">/mo</span></span> : <span class="chip chip-quiet">Left</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
