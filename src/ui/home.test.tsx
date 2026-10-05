import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { DataStore } from '../data/store';
import { MemoryLocalStore } from '../sync/local';
import { todayISO } from '../domain/dates';
import { HomeScreen } from './HomeScreen';

afterEach(cleanup);

const settings = { teacherName: 'Priya', tuitionName: 'Priya Tuition' };

describe('Home: visiting teachers', () => {
  it('has a Visiting teachers tile and a Teachers quick action that open the screen', async () => {
    const goto = vi.fn();
    render(<HomeScreen store={new DataStore(new MemoryLocalStore())} settings={settings} goto={goto} />);
    fireEvent.click(await screen.findByRole('button', { name: /Visiting teachers/ }));
    expect(goto).toHaveBeenLastCalledWith('teachers');
    fireEvent.click(screen.getByRole('button', { name: 'Teachers' }));
    expect(goto).toHaveBeenLastCalledWith('teachers');
  });

  it('shows what was paid to visiting teachers this month', async () => {
    const store = new DataStore(new MemoryLocalStore());
    const t = await store.saveTeacher({ name: 'Mr Rao', phone: '', subject: '', usualAmount: 0, active: true });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 2, amount: 800, note: '' });
    await store.recordVisit({ teacherId: t.id, date: todayISO(), hours: 1, amount: 400, note: '' });
    render(<HomeScreen store={store} settings={settings} goto={vi.fn()} />);
    await screen.findByText(/₹1,200 paid this month/);
  });

  it('invites the first visit when nothing is recorded yet', async () => {
    render(<HomeScreen store={new DataStore(new MemoryLocalStore())} settings={settings} goto={vi.fn()} />);
    await screen.findByText(/Record a visit/);
  });
});
