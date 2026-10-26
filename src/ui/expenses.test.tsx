import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { monthOf, todayISO } from '../domain/dates';
import { ExpensesScreen } from './ExpensesScreen';

afterEach(cleanup);

const month = monthOf(todayISO());
const newStore = () => new DataStore(new MemoryLocalStore());

describe('the expenses screen', () => {
  it('shows an empty month, then adds an expense and totals it', async () => {
    const store = newStore();
    render(<ExpensesScreen store={store} />);
    await screen.findByText(/No expenses/);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.input(screen.getByLabelText('What for'), { target: { value: 'Rent' } });
    fireEvent.input(screen.getByLabelText('Amount (₹)'), { target: { value: '4,000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await screen.findByText('Rent');
    expect(screen.getAllByText('₹4,000').length).toBeGreaterThan(0);
    expect((await store.expenses(month))[0]).toMatchObject({ label: 'Rent', amount: 4000 });
  });

  it('keeps every field when several are filled at the same instant (browser autofill)', async () => {
    const store = newStore();
    render(<ExpensesScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    // Raw events with no re-render between them, as autofill does.
    const fill = (label: string, value: string) => {
      const el = screen.getByLabelText(label) as HTMLInputElement;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill('What for', 'Rent');
    fill('Amount (₹)', '4000');
    fill('Date', '2026-10-05');
    await new Promise((r) => setTimeout(r, 20));
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await screen.findByText('Rent');
    expect((await store.expenses('2026-10'))[0]).toMatchObject({ label: 'Rent', amount: 4000, date: '2026-10-05' });
  });

  it('refuses an empty label or a bad amount with a message', async () => {
    render(<ExpensesScreen store={newStore()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await screen.findByRole('alert');
  });

  it('deletes an expense after tapping it', async () => {
    const store = newStore();
    await store.recordExpense({ date: todayISO(), label: 'Chalk', amount: 150 });
    render(<ExpensesScreen store={store} />);
    fireEvent.click(await screen.findByText('Chalk'));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete expense' }));
    await screen.findByText(/No expenses/);
    expect(await store.expenses(month)).toEqual([]);
  });
});
