import { useRef, useState } from 'preact/hooks';
import type { Teacher, Visit } from '../domain/types';
import { addMonths, monthLabel, monthOf, todayISO } from '../domain/dates';
import { formatRupees } from '../domain/money';
import { formatHours, parseHours, visitSummary } from '../domain/teachers';
import { validateTeacher } from '../domain/validate';
import type { DataStore } from '../data/store';
import { visitsCsv, visitSummaryCsv } from '../reports/csv';
import { Avatar, Empty, Errors, Field, PageHeader, val } from './common';
import { downloadText, useLoad } from './hooks';
import { MonthNav } from './FeesScreen';
import { IconDownload, IconPlus } from './icons';

const QUICK_HOURS = ['1', '1.5', '2', '3', '4'];

type Mode = 'visits' | 'teachers';
type VisitDraft = { id?: string; month?: string; teacherId: string; date: string; hours: string; amount: string; note: string; amountTouched: boolean };
type TeacherDraft = { id?: string; name: string; phone: string; subject: string; usual: string; active: boolean };

const blankVisit = (teacherId = '', amount = ''): VisitDraft => ({ teacherId, date: todayISO(), hours: '', amount, note: '', amountTouched: false });
const blankTeacher = (): TeacherDraft => ({ name: '', phone: '', subject: '', usual: '', active: true });

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

function dayParts(iso: string): { day: string; weekday: string } {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return { day: String(d), weekday: new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short' }) };
}

export function TeachersScreen({ store }: { store: DataStore }) {
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [mode, setMode] = useState<Mode>('visits');
  const [visitDraft, setVisitDraft] = useState<VisitDraft | null>(null);
  const [teacherDraft, setTeacherDraft] = useState<TeacherDraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const { data: teachers, reload: reloadTeachers } = useLoad(() => store.teachers(), [store]);
  const { data: visits, reload: reloadVisits } = useLoad(() => store.visits(month), [store, month]);
  const saving = useRef(false);

  const activeTeachers = (teachers ?? []).filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name));
  const summary = visitSummary(teachers ?? [], visits ?? []);
  const nameOf = (id: string) => teachers?.find((t) => t.id === id)?.name ?? 'Unknown teacher';

  const closeForms = () => {
    setVisitDraft(null);
    setTeacherDraft(null);
    setErrors([]);
  };

  // ---------- visit form ----------

  async function saveVisit(e: Event) {
    e.preventDefault();
    const d = visitDraft;
    if (!d || saving.current) return;
    if (!d.teacherId) return setErrors(['Choose the teacher']);
    const hours = parseHours(d.hours);
    if (hours === null) return setErrors(['Hours must be above 0 and at most 24, in steps of 0.25 (for example 1.5)']);
    const amount = parseAmount(d.amount);
    if (amount === null) return setErrors(['Enter the amount paid in rupees (0 if nothing was paid)']);
    saving.current = true;
    try {
      const fields = { teacherId: d.teacherId, date: d.date, hours, amount, note: d.note.trim() };
      if (d.id && d.month) await store.updateVisit(d.id, d.month, fields);
      else await store.recordVisit(fields);
      const shownMonth = monthOf(d.date);
      closeForms();
      if (shownMonth !== month) setMonth(shownMonth);
      reloadVisits();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      saving.current = false;
    }
  }

  async function deleteVisit() {
    const d = visitDraft;
    if (!d?.id || !d.month) return;
    if (!window.confirm('Delete this visit? It will no longer count in the totals.')) return;
    try {
      await store.deleteVisit(d.id, d.month);
      closeForms();
      reloadVisits();
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  const setVisit = (patch: Partial<VisitDraft>) => setVisitDraft((cur) => (cur ? { ...cur, ...patch } : cur));

  function chooseTeacher(id: string) {
    const t = teachers?.find((x) => x.id === id);
    // The usual amount only pre-fills; once you type your own, it is left alone.
    setVisitDraft((cur) => (cur ? { ...cur, teacherId: id, amount: cur.amountTouched || !t || t.usualAmount <= 0 ? cur.amount : String(t.usualAmount) } : cur));
  }

  if (visitDraft) {
    const d = visitDraft;
    if (!teachers) return <div class="screen" />;
    const choices = teachers.filter((t) => t.active || t.id === d.teacherId).sort((a, b) => a.name.localeCompare(b.name));
    if (choices.length === 0) {
      return (
        <div class="screen">
          <PageHeader title="Record visit" />
          <Empty
            title="Add a teacher first"
            text="Visits are recorded against a teacher, so add the teacher once, then record each visit in seconds."
            action={<button class="btn primary" type="button" onClick={() => { setVisitDraft(null); setMode('teachers'); setTeacherDraft(blankTeacher()); }}>Add teacher</button>}
          />
          <button class="btn wide" type="button" onClick={closeForms}>Cancel</button>
        </div>
      );
    }
    return (
      <form class="screen" onSubmit={saveVisit}>
        <PageHeader title={d.id ? 'Edit visit' : 'Record visit'} />
        <div class="card">
          <Field label="Teacher">
            <select value={d.teacherId} onChange={(e) => chooseTeacher((e.target as HTMLSelectElement).value)}>
              <option value="">Choose teacher</option>
              {choices.map((t) => <option key={t.id} value={t.id}>{t.name}{t.subject ? ` (${t.subject})` : ''}</option>)}
            </select>
          </Field>
          <Field label="Date"><input type="date" value={d.date} max={todayISO()} onInput={(e) => setVisit({ date: val(e) })} /></Field>
          <Field label="Hours worked" hint="In steps of 0.25, for example 1.5">
            <input value={d.hours} inputMode="decimal" onInput={(e) => setVisit({ hours: val(e) })} autoComplete="off" />
          </Field>
          <div class="chips" role="group" aria-label="Common hours">
            {QUICK_HOURS.map((h) => (
              <button key={h} type="button" class={d.hours === h ? 'chipbtn on' : 'chipbtn'} aria-label={`Set hours to ${h}`} onClick={() => setVisit({ hours: h })}>{h} h</button>
            ))}
          </div>
          <Field label="Amount paid (₹)">
            <input value={d.amount} inputMode="numeric" onInput={(e) => setVisit({ amount: val(e), amountTouched: true })} autoComplete="off" />
          </Field>
          <Field label="Note (optional)" hint="For example: Maths revision class">
            <input value={d.note} onInput={(e) => setVisit({ note: val(e) })} autoComplete="off" />
          </Field>
        </div>
        <Errors errors={errors} />
        <div class="form-actions">
          <button class="btn primary wide" type="submit">Save visit</button>
          <button class="btn wide" type="button" onClick={closeForms}>Cancel</button>
          {d.id && <button class="btn danger wide" type="button" onClick={deleteVisit}>Delete visit</button>}
        </div>
      </form>
    );
  }

  // ---------- teacher form ----------

  async function saveTeacher(e: Event) {
    e.preventDefault();
    const d = teacherDraft;
    if (!d) return;
    const usual = d.usual.trim() === '' ? 0 : parseAmount(d.usual);
    const candidate = { name: d.name.trim(), phone: d.phone.trim(), subject: d.subject.trim(), usualAmount: usual ?? -1, active: d.active };
    const errs = validateTeacher({ ...candidate, id: d.id ?? 'new', updatedAt: '' });
    if (errs.length) return setErrors(errs.map((x) => x.message));
    try {
      await store.saveTeacher({ ...candidate, ...(d.id ? { id: d.id } : {}) });
      closeForms();
      reloadTeachers();
    } catch (err) {
      setErrors([(err as Error).message]);
    }
  }

  async function toggleTeacher() {
    const d = teacherDraft;
    if (!d?.id) return;
    await store.setTeacherActive(d.id, !d.active);
    closeForms();
    reloadTeachers();
  }

  if (teacherDraft) {
    const d = teacherDraft;
    // Functional update: several fields can change in the same instant (autofill), none may be lost.
    const set = (patch: Partial<TeacherDraft>) => setTeacherDraft((cur) => (cur ? { ...cur, ...patch } : cur));
    return (
      <form class="screen" onSubmit={saveTeacher}>
        <PageHeader title={d.id ? 'Edit teacher' : 'Add teacher'} />
        <div class="card">
          <Field label="Name"><input value={d.name} onInput={(e) => set({ name: val(e) })} autoComplete="off" /></Field>
          <Field label="Subject"><input value={d.subject} onInput={(e) => set({ subject: val(e) })} autoComplete="off" /></Field>
          <Field label="Phone" hint="Optional"><input value={d.phone} inputMode="tel" onInput={(e) => set({ phone: val(e) })} autoComplete="off" /></Field>
          <Field label="Usual amount per day (₹)" hint="Optional. It only pre-fills a new visit; you can change it each time.">
            <input value={d.usual} inputMode="numeric" onInput={(e) => set({ usual: val(e) })} autoComplete="off" />
          </Field>
        </div>
        <Errors errors={errors} />
        <div class="form-actions">
          <button class="btn primary wide" type="submit">Save teacher</button>
          <button class="btn wide" type="button" onClick={closeForms}>Cancel</button>
          {d.id && (
            <button class="btn quiet wide" type="button" onClick={toggleTeacher}>
              {d.active ? 'No longer visits (hide from the list)' : 'Visits again (show in the list)'}
            </button>
          )}
        </div>
      </form>
    );
  }

  // ---------- main view ----------

  const hasVisits = (visits ?? []).length > 0;

  return (
    <div class="screen">
      <PageHeader
        title="Visiting teachers"
        sub="Paid per visit"
        action={<button class="btn primary" type="button" onClick={() => setVisitDraft(blankVisit(activeTeachers.length === 1 ? activeTeachers[0]!.id : '', activeTeachers.length === 1 && activeTeachers[0]!.usualAmount > 0 ? String(activeTeachers[0]!.usualAmount) : ''))}><IconPlus size={20} /> Record visit</button>}
      />

      <div class="seg" role="group" aria-label="Show">
        <button type="button" class={mode === 'visits' ? 'on' : ''} aria-pressed={mode === 'visits'} onClick={() => setMode('visits')}>Visits</button>
        <button type="button" class={mode === 'teachers' ? 'on' : ''} aria-pressed={mode === 'teachers'} onClick={() => setMode('teachers')}>Teachers</button>
      </div>

      {mode === 'teachers' && (
        <>
          {teachers && teachers.length === 0 && <Empty title="No teachers yet" text="Add the teachers who come in for special classes." />}
          {teachers && teachers.length > 0 && (
            <ul class="list" aria-label="Teachers">
              {[...teachers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)).map((t: Teacher) => (
                <li key={t.id} class={t.active ? '' : 'inactive'}>
                  <button type="button" class="row-button" aria-label={`Edit ${t.name}`} onClick={() => setTeacherDraft({ id: t.id, name: t.name, phone: t.phone, subject: t.subject, usual: t.usualAmount ? String(t.usualAmount) : '', active: t.active })}>
                    <Avatar name={t.name} />
                    <span class="item-main">
                      <strong class="item-name">{t.name}</strong>
                      <span class="item-meta">{t.subject || 'No subject'}{t.usualAmount ? ` · usually ${formatRupees(t.usualAmount)}/day` : ''}</span>
                    </span>
                    {!t.active && <span class="chip chip-quiet">Not visiting</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button class="btn wide" type="button" onClick={() => setTeacherDraft(blankTeacher())}><IconPlus size={20} /> Add teacher</button>
        </>
      )}

      {mode === 'visits' && (
        <>
          <MonthNav month={month} onChange={setMonth} suffix=" for visiting teachers" />

          <div class="hero">
            <span class="label">Paid to visiting teachers in {monthLabel(month)}</span>
            <p class="pending-total">{formatRupees(summary.totals.paid)} paid</p>
            <span class="sub">{summary.totals.visits} {summary.totals.visits === 1 ? 'visit' : 'visits'} · {formatHours(summary.totals.hours)}</span>
          </div>

          {summary.rows.length > 0 && (
            <>
              <h3>By teacher</h3>
              <ul class="list" aria-label="Payout by teacher">
                {summary.rows.map((r) => (
                  <li key={r.teacher.id}>
                    <Avatar name={r.teacher.name} />
                    <span class="item-main">
                      <strong class="item-name">{r.teacher.name}</strong>
                      <span class="item-meta">{r.visits} {r.visits === 1 ? 'visit' : 'visits'} · {formatHours(r.hours)}</span>
                    </span>
                    <span class="amount">{formatRupees(r.paid)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {visits && !hasVisits && (
            <Empty
              title="No visits this month"
              text={activeTeachers.length ? 'Tap Record visit when a teacher comes in.' : 'Add a teacher, then record each visit.'}
            />
          )}
          {hasVisits && (
            <>
              <h3>Visits</h3>
              <ul class="list" aria-label="Visits this month">
                {(visits ?? []).map((v: Visit) => {
                  const p = dayParts(v.date);
                  return (
                    <li key={v.id}>
                      <button
                        type="button" class="row-button" aria-label={`Edit visit by ${nameOf(v.teacherId)} on ${v.date}`}
                        onClick={() => setVisitDraft({ id: v.id, month, teacherId: v.teacherId, date: v.date, hours: String(v.hours), amount: String(v.amount), note: v.note, amountTouched: true })}
                      >
                        <span class="vdate"><b>{p.day}</b><span>{p.weekday}</span></span>
                        <span class="item-main">
                          <strong class="item-name">{nameOf(v.teacherId)}</strong>
                          <span class="item-meta">{v.note || teachers?.find((t) => t.id === v.teacherId)?.subject || 'Visit'}</span>
                        </span>
                        <span class="vpay">
                          <span class="amount">{formatRupees(v.amount)}</span>
                          <span class="item-meta">{formatHours(v.hours)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <div class="card">
            <h3>Download</h3>
            <p class="muted small">CSV files open in Excel or Google Sheets.</p>
            <button class="btn wide" type="button" disabled={!hasVisits} onClick={() => downloadText(`visits_${month}.csv`, visitsCsv(teachers ?? [], visits ?? []))}>
              <IconDownload size={20} /> Download visits CSV
            </button>
            <button class="btn wide" type="button" disabled={!hasVisits} onClick={() => downloadText(`teacher_payouts_${month}.csv`, visitSummaryCsv(teachers ?? [], visits ?? []))}>
              <IconDownload size={20} /> Download payout summary CSV
            </button>
          </div>
        </>
      )}
    </div>
  );
}
