import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { CrashGuard } from './CrashGuard';

afterEach(cleanup);

function Boom(): never {
  throw new Error('kaboom');
}

describe('CrashGuard', () => {
  it('renders children normally', () => {
    render(<CrashGuard><p>all good</p></CrashGuard>);
    expect(screen.getByText('all good')).toBeTruthy();
  });
  it('shows a calm recovery screen when a child throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CrashGuard><Boom /></CrashGuard>);
    await screen.findByText(/Something went wrong/);
    expect(screen.getByRole('button', { name: 'Reload the app' })).toBeTruthy();
    spy.mockRestore();
  });
});
