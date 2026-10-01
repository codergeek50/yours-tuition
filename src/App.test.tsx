import 'fake-indexeddb/auto';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from './App';
import { loadVault, saveVault, sealToken, encodeSetupLink, clearDeviceKey } from './vault/vault';
import { MemoryLocalStore } from './sync/local';

beforeEach(async () => {
  localStorage.clear();
  history.replaceState(null, '', '/');
  await clearDeviceKey();
});
afterEach(cleanup);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const repoFetch = (isPrivate: boolean) =>
  vi.fn(async (url: string) => {
    if (url.endsWith('/repos/me/data')) return json({ private: isPrivate });
    return json({ message: 'Not Found' }, 404); // empty data repo
  }) as unknown as typeof fetch;

const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, local: () => new MemoryLocalStore(), debounceMs: 10 });

async function fillConnect(repo = 'me/data', token = 'github_pat_x') {
  fireEvent.input(await screen.findByLabelText('Data repository (owner/name)'), { target: { value: repo } });
  fireEvent.input(screen.getByLabelText('Access token'), { target: { value: token } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

const inApp = () => screen.findByRole('button', { name: 'Attendance' });

describe('first run', () => {
  it('shows the product name and a simple connect screen with no PIN', async () => {
    render(<App deps={deps(repoFetch(true))} />);
    expect(await screen.findByRole('heading', { name: 'YOURS Tuition' })).toBeTruthy();
    expect(screen.getByText(/Connect your data repository/)).toBeTruthy();
    expect(screen.queryByLabelText(/PIN/)).toBeNull();
  });

  it('refuses a public data repository and stores nothing', async () => {
    render(<App deps={deps(repoFetch(false))} />);
    await fillConnect();
    await screen.findByText(/must be private/i);
    expect(loadVault()).toBeNull();
  });

  it('connects and goes straight into the app, with the token encrypted', async () => {
    render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
    const rec = loadVault()!;
    expect(rec.owner).toBe('me');
    expect(rec.mode).toBe('device');
    expect(JSON.stringify(rec)).not.toContain('github_pat_x');
  });
});

describe('the teacher never sees setup', () => {
  it('reopens straight into the app when already connected', async () => {
    const first = render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
    first.unmount();
    render(<App deps={deps(repoFetch(true))} />);
    await inApp();
    expect(screen.queryByText(/Connect your data repository/)).toBeNull();
  });

  it('sets itself up from a setup link and removes the token from the address bar', async () => {
    history.replaceState(null, '', encodeSetupLink(location.origin + '/', 'me/data', 'github_pat_link'));
    render(<App deps={deps(repoFetch(true))} />);
    await inApp();
    expect(loadVault()!.repo).toBe('data');
    expect(location.hash).toBe('');
  });

  it('does not flash the connect screen while opening', async () => {
    const first = render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
    first.unmount();
    render(<App deps={deps(repoFetch(true))} />);
    expect(screen.queryByText(/Connect your data repository/)).toBeNull();
    await inApp();
  });

  it('opens offline using the saved copy when GitHub cannot be reached', async () => {
    const first = render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
    first.unmount();
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    render(<App deps={deps(offline)} />);
    await inApp();
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeTruthy());
  });

  it('refuses to open if the data repo has become public, with a way to retry', async () => {
    const first = render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
    first.unmount();
    render(<App deps={deps(repoFetch(false))} />);
    await screen.findByText(/must be private/i);
    expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('optional PIN', () => {
  async function connected() {
    render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    await inApp();
  }

  it('can be turned on in More, then is asked on the next open, and rejects a wrong one', async () => {
    await connected();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.input(await screen.findByLabelText('New PIN (4 to 8 digits)'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on PIN lock' }));
    await screen.findByText(/PIN lock is on/);
    expect(loadVault()!.mode).toBe('pin');
    cleanup();

    render(<App deps={deps(repoFetch(true))} />);
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByText(/Wrong PIN/);
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await inApp();
  });

  it('can be turned off again', async () => {
    saveVault(await sealToken('tok', '1234', { owner: 'me', repo: 'data' }));
    render(<App deps={deps(repoFetch(true))} />);
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await inApp();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off PIN lock' }));
    await screen.findByText(/PIN lock is off/);
    expect(loadVault()!.mode).toBe('device');
  });
});

describe('More', () => {
  it('creates a setup link for another phone', async () => {
    render(<App deps={deps(repoFetch(true))} />);
    await fillConnect('me/data', 'github_pat_share');
    await inApp();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show setup link for another phone' }));
    const box = (await screen.findByLabelText('Setup link')) as HTMLInputElement;
    expect(box.value).toContain('#setup=');
    expect(box.value).not.toContain('github_pat_share');
  });

  it('disconnect clears the saved token and returns to the connect screen', async () => {
    render(<App deps={deps(repoFetch(true))} />);
    await fillConnect();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect this phone' }));
    await screen.findByText(/Connect your data repository/);
    expect(loadVault()).toBeNull();
  });
});
