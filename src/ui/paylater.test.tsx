import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { monthOf, todayISO } from '../domain/dates';
import { TeachersScreen } from './TeachersScreen';

afterEach(cleanup);

const month = monthOf(todayISO());
const newStore = () => new DataStore(new MemoryLocalStore());
const rao = { name: 'Mr Rao', phone: '', subject: 'Maths', usualAmount: 800, active: true };

async function openRecordForm(teacherId: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
  fireEvent.change(await screen.findByLabelText('Teacher'), { target: { value: teacherId } });
  fireEvent.input(screen.getByLabelText('Hours worked'), { target: { value: '2' } });
}

describe('recording a visit as pay later', () => {
  it('defaults to Paid now; choosing Pay later changes the wording and saves a pending visit', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    render(<TeachersScreen store={store} />);
    await openRecordForm(t.id);
    expect(screen.getByRole('button', { name: 'Paid now' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByLabelText('Amount paid (₹)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pay later' }));
    await screen.findByLabelText('Amount to pay (₹)');
    await screen.findByText(/Not paid yet/);
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    await screen.findByText(/₹800 pending this month/);
    expect(screen.getByText(/₹0 paid/)).toBeTruthy();
    const list = await screen.findByRole('list', { name: 'Visits this month' });
    expect(within(list).getByText('Pending')).toBeTruthy();
    expect((await store.visits(month))[0]).toMatchObject({ paid: false, paidOn: '', amount: 800 });
  });
});

describe('settling a pending visit', () => {
  it('Mark as paid on the edit screen moves it from pending to paid', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '', paid: false });
    render(<TeachersScreen store={store} />);
    await screen.findByText(/₹800 pending this month/);
    fireEvent.click(await screen.findByRole('button', { name: /Edit visit by Mr Rao/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as paid' }));
    await screen.findByText(/₹800 paid/);
    expect(screen.queryByText(/pending this month/)).toBeNull();
    expect((await store.visits(month))[0]).toMatchObject({ paid: true, paidOn: todayISO() });
  });

  it('a paid visit has no Mark as paid button, and can be switched to pay later', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit visit by Mr Rao/ }));
    await screen.findByRole('button', { name: 'Save visit' });
    expect(screen.queryByRole('button', { name: 'Mark as paid' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pay later' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    await screen.findByText(/₹800 pending this month/);
  });

  it('editing the note of a paid visit keeps its original paid date', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    const v = await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '', paid: true, paidOn: todayISO() });
    await store.updateVisit(v.id, month, { paidOn: '2026-01-02' });
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit visit by Mr Rao/ }));
    fireEvent.input(await screen.findByLabelText('Note (optional)'), { target: { value: 'Extra topic' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    await waitFor(async () => expect((await store.visits(month))[0]).toMatchObject({ note: 'Extra topic', paidOn: '2026-01-02' }));
  });
});

describe('still to pay, across months', () => {
  const seedOldPending = async (store: DataStore) => {
    const t = await store.saveTeacher(rao);
    const oldMonthDate = `${monthOf(todayISO()).slice(0, 4)}-01-10`;
    await store.recordVisit({ teacherId: t.id, date: oldMonthDate, hours: 1, amount: 500, note: '', paid: false });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '', paid: false });
    return t;
  };

  it('lists what is owed to each teacher over all months, even when this month has none', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    await store.recordVisit({ teacherId: t.id, date: '2026-01-10', hours: 1, amount: 500, note: '', paid: false });
    render(<TeachersScreen store={store} />);
    const card = await screen.findByRole('region', { name: 'Still to pay' });
    expect(within(card).getByText('Mr Rao')).toBeTruthy();
    expect(card.textContent).toContain('₹500');
    expect(card.textContent).toContain('1 visit');
  });

  it('Mark all paid settles every pending visit of that teacher after confirming', async () => {
    const store = newStore();
    const t = await seedOldPending(store);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all pending paid for Mr Rao' }));
    await waitFor(async () => expect((await store.pendingOverview()).count).toBe(0));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Still to pay' })).toBeNull());
    await screen.findByText(/₹800 paid/);
    expect((await store.visits(month))[0]).toMatchObject({ teacherId: t.id, paid: true });
  });

  it('does nothing if the confirmation is declined', async () => {
    const store = newStore();
    await seedOldPending(store);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all pending paid for Mr Rao' }));
    await new Promise((r) => setTimeout(r, 40));
    expect((await store.pendingOverview()).count).toBe(2);
  });

  it('the month rows show what is still owed to each teacher', async () => {
    const store = newStore();
    const t = await store.saveTeacher(rao);
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 1, amount: 400, note: '', paid: false });
    render(<TeachersScreen store={store} />);
    const summary = await screen.findByRole('list', { name: 'Payout by teacher' });
    const row = within(summary).getByText('Mr Rao').closest('li')!;
    expect(row.textContent).toContain('₹800');
    expect(row.textContent).toContain('₹400 pending');
  });
});
