import { useRef, useState } from 'preact/hooks';
import { monthOf, todayISO } from '../domain/dates';
import { formatRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import { expensesCsv } from '../reports/csv';
import { Empty, Errors, Field, PageHeader, val } from './common';
import { downloadText, useLoad } from './hooks';
import { MonthNav } from './FeesScreen';
import { IconDownload, IconPlus } from './icons';

type Draft = { id?: string; month?: string; date: string; label: string; amount: string };
const blank = (): Draft => ({ date: todayISO(), label: '', amount: '' });

function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

export function ExpensesScreen({ store }: { store: DataStore }) {
  const [month, setMonth] = useState(monthOf(todayISO()));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const { data: expenses, reload } = useLoad(() => store.expenses(month), [store, month]);
  const saving = useRef(false);

  const total = (expenses ?? []).reduce((n, x) => n + x.amount, 0);
  const close = () => {
    setDraft(null);
    setErrors([]);
  };

  async function save(e: Event) {
    e.preventDefault();
    const d = draft;
    if (!d || saving.current) return;
    const amount = parseAmount(d.amount);
    if (amount === null) return setErrors(['Enter the amount in rupees, for example 4000']);
    saving.current = true;
    try {
      const fields = { date: d.date, label: d.label, amount };
      if (d.id && d.month) await store.updateExpense(d.id, d.month, fields);
      else await store.recordExpense(fields);
      const shown = monthOf(d.date);
      close();
      if (shown !== month) setMonth(shown);
      reload();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      saving.current = false;
    }
  }

  async function remove() {
    const d = draft;
    if (!d?.id || !d.month || saving.current) return;
    saving.current = true;
    try {
      await store.deleteExpense(d.id, d.month);
      close();
      reload();
    } catch (err) {
      setErrors([(err as Error).message]);
    } finally {
      saving.current = false;
    }
  }

  return (
    <div class="screen">
      <PageHeader title="Expenses" sub="Rent, supplies and other costs" />
      <MonthNav month={month} onChange={setMonth} suffix=" for expenses" />

      {!draft && (
        <>
          <div class="stats two">
            <div class="stat"><span>Spent this month</span><b>{formatRupees(total)}</b></div>
            <div class="stat"><span>Entries</span><b>{expenses?.length ?? 0}</b></div>
          </div>
          <button class="btn primary wide" type="button" onClick={() => setDraft(blank())}><IconPlus size={20} /> Add expense</button>

          {expenses && expenses.length === 0 && <Empty title="No expenses this month" text="Add the rent or any other cost to keep your monthly total honest." />}
          {expenses && expenses.length > 0 && (
            <ul class="cards" aria-label="Expenses this month">
              {expenses.map((x) => (
                <li key={x.id}>
                  <button type="button" class="item" onClick={() => setDraft({ id: x.id, month, date: x.date, label: x.label, amount: String(x.amount) })}>
                    <div class="item-main">
                      <span class="item-name">{x.label}</span>
                      <span class="item-meta">{x.date}</span>
                    </div>
                    <b>{formatRupees(x.amount)}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button class="btn wide" type="button" disabled={!expenses || expenses.length === 0}
            onClick={() => downloadText(`expenses_${month}.csv`, expensesCsv(expenses ?? []))}>
            <IconDownload size={20} /> Download expenses CSV
          </button>
        </>
      )}

      {draft && (
        <form class="card" onSubmit={save}>
          <h3>{draft.id ? 'Edit expense' : 'Add expense'}</h3>
          <Field label="What for"><input type="text" value={draft.label} placeholder="Rent" maxLength={80} onInput={(e) => setDraft({ ...draft, label: val(e) })} /></Field>
          <Field label="Amount (₹)"><input type="text" inputMode="numeric" value={draft.amount} placeholder="4000" onInput={(e) => setDraft({ ...draft, amount: val(e) })} /></Field>
          <Field label="Date"><input type="date" value={draft.date} onInput={(e) => setDraft({ ...draft, date: val(e) })} /></Field>
          <Errors errors={errors} />
          <button class="btn primary wide" type="submit">Save expense</button>
          <button class="btn wide" type="button" onClick={close}>Cancel</button>
          {draft.id && <button class="btn quiet wide" type="button" onClick={remove}>Delete expense</button>}
        </form>
      )}
    </div>
  );
}
