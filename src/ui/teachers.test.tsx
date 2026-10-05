import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { monthOf, todayISO } from '../domain/dates';
import { TeachersScreen } from './TeachersScreen';

afterEach(cleanup);

const month = monthOf(todayISO());
const newStore = () => new DataStore(new MemoryLocalStore());
const seedTeachers = async (store: DataStore) => {
  const rao = await store.saveTeacher({ name: 'Mr Rao', phone: '', subject: 'Maths', usualAmount: 800, active: true });
  const iyer = await store.saveTeacher({ name: 'Ms Iyer', phone: '', subject: 'Science', usualAmount: 1200, active: true });
  return { rao, iyer };
};

async function recordVia(ui: { teacher: string; hours: string; amount?: string; note?: string }) {
  fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
  fireEvent.change(await screen.findByLabelText('Teacher'), { target: { value: ui.teacher } });
  fireEvent.input(screen.getByLabelText('Hours worked'), { target: { value: ui.hours } });
  if (ui.amount !== undefined) fireEvent.input(screen.getByLabelText('Amount paid (₹)'), { target: { value: ui.amount } });
  if (ui.note) fireEvent.input(screen.getByLabelText('Note (optional)'), { target: { value: ui.note } });
  fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
}

describe('teachers', () => {
  it('guides you to add a teacher first, then saves the teacher', async () => {
    const store = newStore();
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
    await screen.findByText(/Add a teacher first/);
    fireEvent.click(screen.getByRole('button', { name: 'Add teacher' }));
    fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Mr Rao' } });
    fireEvent.input(screen.getByLabelText('Subject'), { target: { value: 'Maths' } });
    fireEvent.input(screen.getByLabelText('Usual amount per day (₹)'), { target: { value: '800' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save teacher' }));
    await waitFor(async () => expect((await store.teachers())[0]).toMatchObject({ name: 'Mr Rao', subject: 'Maths', usualAmount: 800 }));
  });

  it('keeps every field when several arrive in the same instant (autofill, paste)', async () => {
    const store = newStore();
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teachers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add teacher' }));
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement;
    const subject = screen.getByLabelText('Subject') as HTMLInputElement;
    const usual = screen.getByLabelText('Usual amount per day (₹)') as HTMLInputElement;
    // Raw events with no re-render in between, like a browser autofilling the whole form at once.
    for (const [el, v] of [[name, 'Mr Rao'], [subject, 'Maths'], [usual, '800']] as [HTMLInputElement, string][]) {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await new Promise((r) => setTimeout(r, 30));
    fireEvent.click(screen.getByRole('button', { name: 'Save teacher' }));
    await waitFor(async () => expect((await store.teachers())[0]).toMatchObject({ name: 'Mr Rao', subject: 'Maths', usualAmount: 800 }));
  });

  it('rejects a teacher without a name', async () => {
    render(<TeachersScreen store={newStore()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Teachers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add teacher' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save teacher' }));
    await screen.findByText(/Name is required/);
  });
});

describe('recording visits', () => {
  it('records a visit with hours and amount, and shows it with the month total', async () => {
    const store = newStore();
    const { rao } = await seedTeachers(store);
    render(<TeachersScreen store={store} />);
    await recordVia({ teacher: rao.id, hours: '2', amount: '800', note: 'Revision class' });
    await screen.findByText(/₹800 paid/);
    const list = await screen.findByRole('list', { name: 'Visits this month' });
    expect(within(list).getByText('Mr Rao')).toBeTruthy();
    expect(within(list).getByText(/Revision class/)).toBeTruthy();
    expect(within(list).getByText('2 h')).toBeTruthy();
    expect((await store.visits(month))[0]).toMatchObject({ hours: 2, amount: 800, note: 'Revision class' });
  });

  it('pre-fills the amount from the usual amount until you type your own', async () => {
    const store = newStore();
    const { rao, iyer } = await seedTeachers(store);
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
    const select = await screen.findByLabelText('Teacher');
    fireEvent.change(select, { target: { value: rao.id } });
    await waitFor(() => expect((screen.getByLabelText('Amount paid (₹)') as HTMLInputElement).value).toBe('800'));
    fireEvent.change(select, { target: { value: iyer.id } });
    await waitFor(() => expect((screen.getByLabelText('Amount paid (₹)') as HTMLInputElement).value).toBe('1200'));
    fireEvent.input(screen.getByLabelText('Amount paid (₹)'), { target: { value: '1000' } });
    fireEvent.change(select, { target: { value: rao.id } });
    await new Promise((r) => setTimeout(r, 30));
    expect((screen.getByLabelText('Amount paid (₹)') as HTMLInputElement).value).toBe('1000');
  });

  it('quick buttons set the hours', async () => {
    const store = newStore();
    await seedTeachers(store);
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Set hours to 1.5' }));
    await waitFor(() => expect((screen.getByLabelText('Hours worked') as HTMLInputElement).value).toBe('1.5'));
  });

  it('shows clear errors for a missing teacher and for bad hours', async () => {
    const store = newStore();
    const { rao } = await seedTeachers(store);
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Record visit' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save visit' }));
    await screen.findByText(/Choose the teacher/);
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: rao.id } });
    fireEvent.input(screen.getByLabelText('Hours worked'), { target: { value: '1.1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    await screen.findByText(/Hours must be above 0/);
    expect(await store.visits(month)).toEqual([]);
  });

  it('edits and deletes a visit', async () => {
    const store = newStore();
    const { rao } = await seedTeachers(store);
    await store.recordVisit({ teacherId: rao.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    render(<TeachersScreen store={store} />);
    fireEvent.click(await screen.findByRole('button', { name: /Edit visit by Mr Rao/ }));
    fireEvent.input(await screen.findByLabelText('Amount paid (₹)'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save visit' }));
    await screen.findByText(/₹900 paid/);
    fireEvent.click(await screen.findByRole('button', { name: /Edit visit by Mr Rao/ }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete visit' }));
    await screen.findByText(/₹0 paid/);
    expect(await store.visits(month)).toEqual([]);
  });
});

describe('monthly payout summary', () => {
  it('totals each teacher and the month', async () => {
    const store = newStore();
    const { rao, iyer } = await seedTeachers(store);
    const today = todayISO();
    await store.recordVisit({ teacherId: rao.id, date: today, hours: 2, amount: 800, note: '' });
    await store.recordVisit({ teacherId: rao.id, date: today, hours: 1.5, amount: 600, note: '' });
    await store.recordVisit({ teacherId: iyer.id, date: today, hours: 3, amount: 1500, note: '' });
    render(<TeachersScreen store={store} />);
    await screen.findByText(/₹2,900 paid/);
    const summary = await screen.findByRole('list', { name: 'Payout by teacher' });
    const raoRow = within(summary).getByText('Mr Rao').closest('li')!;
    expect(raoRow.textContent).toContain('2 visits');
    expect(raoRow.textContent).toContain('3.5 h');
    expect(raoRow.textContent).toContain('₹1,400');
    expect(screen.getByText(/3 visits · 6.5 h/)).toBeTruthy();
  });

  it('only shows the chosen month', async () => {
    const store = newStore();
    const { rao } = await seedTeachers(store);
    await store.recordVisit({ teacherId: rao.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    render(<TeachersScreen store={store} />);
    await screen.findByText(/₹800 paid/);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month for visiting teachers' }));
    await screen.findByText(/₹0 paid/);
  });

  it('downloads are available only when there is something to download', async () => {
    const store = newStore();
    const { rao } = await seedTeachers(store);
    render(<TeachersScreen store={store} />);
    expect(((await screen.findByRole('button', { name: /Download visits CSV/ })) as HTMLButtonElement).disabled).toBe(true);
    await store.recordVisit({ teacherId: rao.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    cleanup();
    render(<TeachersScreen store={store} />);
    await waitFor(async () => expect(((await screen.findByRole('button', { name: /Download visits CSV/ })) as HTMLButtonElement).disabled).toBe(false));
    expect(((await screen.findByRole('button', { name: /Download payout summary CSV/ })) as HTMLButtonElement).disabled).toBe(false);
  });
});
