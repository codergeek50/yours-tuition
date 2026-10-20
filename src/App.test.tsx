import 'fake-indexeddb/auto';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { App } from './App';
import { loadVault, saveVault, sealToken, encodeSetupLink, clearDeviceKey } from './vault/vault';
import { MemoryLocalStore } from './sync/local';
import { fakeAppsScript } from './test-support/fakeAppsScript';

let fake: ReturnType<typeof fakeAppsScript>;

beforeEach(async () => {
  fake = fakeAppsScript();
  localStorage.clear();
  history.replaceState(null, '', '/');
  await clearDeviceKey();
});
afterEach(cleanup);

const deps = (fetchImpl: typeof fetch = fake.fetchImpl) => ({ fetchImpl, local: () => new MemoryLocalStore(), debounceMs: 10 });

async function fillConnect(endpoint = fake.endpoint, key = fake.key) {
  fireEvent.input(await screen.findByLabelText('Web app address'), { target: { value: endpoint } });
  fireEvent.input(screen.getByLabelText('Secret key'), { target: { value: key } });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

const inApp = () => screen.findByRole('button', { name: 'Attendance' });

describe('first run', () => {
  it('shows the product name and a simple connect screen with no PIN', async () => {
    render(<App deps={deps()} />);
    expect(await screen.findByRole('heading', { name: 'YOURS Tuition' })).toBeTruthy();
    expect(screen.getByText(/Connect your data/)).toBeTruthy();
    expect(screen.queryByLabelText(/PIN/)).toBeNull();
  });

  it('refuses an address that is not a Google Apps Script web app, and stores nothing', async () => {
    render(<App deps={deps()} />);
    await fillConnect('https://evil.example.com/macros/s/abc/exec');
    await screen.findByText(/Enter the web app address/);
    expect(loadVault()).toBeNull();
  });

  it('refuses a wrong secret key and stores nothing', async () => {
    render(<App deps={deps()} />);
    await fillConnect(fake.endpoint, 'not-the-key');
    await screen.findByText(/did not accept the secret key/i);
    expect(loadVault()).toBeNull();
  });

  it('connects and goes straight into the app, with the key encrypted', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    const rec = loadVault()!;
    expect(rec.endpoint).toBe(fake.endpoint);
    expect(rec.mode).toBe('device');
    expect(JSON.stringify(rec)).not.toContain(fake.key);
    expect(localStorage.length).toBeGreaterThan(0);
    expect([...Array(localStorage.length)].map((_, i) => localStorage.getItem(localStorage.key(i)!)).join('')).not.toContain(fake.key);
  });
});

describe('the teacher never sees setup', () => {
  it('reopens straight into the app when already connected', async () => {
    const first = render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    first.unmount();
    render(<App deps={deps()} />);
    await inApp();
    expect(screen.queryByText(/Connect your data/)).toBeNull();
  });

  it('sets itself up from a setup link and removes the key from the address bar', async () => {
    history.replaceState(null, '', encodeSetupLink(location.origin + '/', fake.endpoint, fake.key));
    render(<App deps={deps()} />);
    await inApp();
    expect(loadVault()!.endpoint).toBe(fake.endpoint);
    expect(location.hash).toBe('');
  });

  it('does not flash the connect screen while opening', async () => {
    const first = render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    first.unmount();
    render(<App deps={deps()} />);
    expect(screen.queryByText(/Connect your data/)).toBeNull();
    await inApp();
  });

  it('opens offline using the saved copy when the data service cannot be reached', async () => {
    const first = render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    first.unmount();
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    render(<App deps={deps(offline)} />);
    await inApp();
    await waitFor(() => expect(screen.getByText(/Offline/)).toBeTruthy());
  });

  it('if the key was replaced, says so clearly and offers Try again', async () => {
    const first = render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    first.unmount();
    fake.server.rotateKey();
    render(<App deps={deps()} />);
    await screen.findByText(/did not accept the secret key/i);
    expect(screen.queryByRole('button', { name: 'Attendance' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('setup links cannot take over a phone that is already set up', () => {
  it('ignores a link for another data service and keeps the existing connection', async () => {
    const first = render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    first.unmount();
    history.replaceState(null, '', encodeSetupLink(location.origin + '/', 'https://script.google.com/macros/s/attacker/exec', 'stolen-key'));
    render(<App deps={deps()} />);
    await screen.findByText(/already set up/i);
    expect(loadVault()!.endpoint).toBe(fake.endpoint);
    expect(location.hash).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await inApp();
  });
});

describe('optional PIN', () => {
  async function connected() {
    render(<App deps={deps()} />);
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

    render(<App deps={deps()} />);
    fireEvent.input(await screen.findByLabelText('PIN'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await screen.findByText(/Wrong PIN/);
    fireEvent.input(screen.getByLabelText('PIN'), { target: { value: '4321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await inApp();
  });

  it('can be turned off again', async () => {
    saveVault(await sealToken(fake.key, '1234', { endpoint: fake.endpoint }));
    render(<App deps={deps()} />);
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
  it('creates a setup link for another phone, without the key in plain text', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Show setup link for another phone' }));
    const box = (await screen.findByLabelText('Setup link')) as HTMLInputElement;
    expect(box.value).toContain('#setup=');
    expect(box.value).not.toContain(fake.key);
  });

  it('links to the readable spreadsheet in Google Drive', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    const link = (await screen.findByRole('link', { name: 'Open the spreadsheet' })) as HTMLAnchorElement;
    expect(link.href).toContain('docs.google.com/spreadsheets');
    expect(link.rel).toContain('noopener');
  });

  it('disconnect clears the saved key and returns to the connect screen', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect this phone' }));
    await screen.findByText(/Connect your data/);
    expect(loadVault()).toBeNull();
  });
});

describe('visiting teachers navigation', () => {
  it('opens from Home and the back button returns Home', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    fireEvent.click(await screen.findByRole('button', { name: 'Teachers' }));
    await screen.findByRole('heading', { name: 'Visiting teachers' });
    fireEvent.click(document.querySelector('.backrow button') as HTMLButtonElement);
    await screen.findByText(/Today at a glance/);
  });
});

describe('data really reaches the data service', () => {
  it('a student added in the app is saved to Drive and appears in the readable sheet', async () => {
    render(<App deps={deps()} />);
    await fillConnect();
    await inApp();
    fireEvent.click(screen.getByRole('button', { name: 'Students' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Add student' }));
    fireEvent.input(await screen.findByLabelText('Name'), { target: { value: 'Asha Rao' } });
    fireEvent.input(screen.getByLabelText('Class'), { target: { value: '8' } });
    fireEvent.input(screen.getByLabelText('Monthly fee (₹)'), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save student' }));
    await waitFor(() => expect(fake.requests.some((r) => r.body.action === 'write' && r.body.path === 'students.json')).toBe(true), { timeout: 3000 });
    await waitFor(() => expect(JSON.stringify([...fake.apps.state.spreadsheets.values()].map((s: any) => [...s.tabs.get('Students')?.values ?? []]))).toContain('Asha Rao'), { timeout: 3000 });
  });
});
