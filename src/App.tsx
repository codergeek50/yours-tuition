import { useEffect, useRef, useState } from 'preact/hooks';
import { GitHubStorage } from './storage/github';
import { AuthError, NetworkError, NotPrivateError } from './storage/types';
import { IdbLocalStore, type LocalStore } from './sync/local';
import {
  clearDeviceKey, clearVault, daysUntilExpiry, decodeSetupLink, encodeSetupLink, isValidPin, loadVault, needsPin,
  openToken, openTokenDevice, saveVault, sealToken, sealTokenDevice, type VaultRecord,
} from './vault/vault';
import { createSession, type Session, type SyncState } from './app/session';
import { loadSettings, type Settings } from './app/settings';
import { ConnectScreen, LockScreen, OpeningScreen, ProblemScreen } from './ui/AuthScreens';
import { AttendanceScreen } from './ui/AttendanceScreen';
import { StudentsScreen } from './ui/StudentsScreen';
import { FeesScreen } from './ui/FeesScreen';
import { ReportsScreen } from './ui/ReportsScreen';
import { MoreScreen } from './ui/MoreScreen';
import { HomeScreen } from './ui/HomeScreen';
import type { Tab } from './ui/nav';
import { BrandMark, IconAttendance, IconBack, IconFees, IconHome, IconMore, IconStudents } from './ui/icons';

export interface AppDeps { fetchImpl?: typeof fetch; local?: () => LocalStore; debounceMs?: number }

const TABS: [Tab, string, () => preact.JSX.Element][] = [
  ['home', 'Home', () => <IconHome />],
  ['attendance', 'Attendance', () => <IconAttendance />],
  ['students', 'Students', () => <IconStudents />],
  ['fees', 'Fees', () => <IconFees />],
  ['more', 'More', () => <IconMore />],
];
const TITLES: Record<Tab, string> = { home: 'YOURS Tuition', attendance: 'Attendance', students: 'Students', fees: 'Fees', reports: 'Reports', more: 'More' };

function parseRepo(input: string): { owner: string; repo: string } | null {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(input.trim());
  return m ? { owner: m[1]!, repo: m[2]! } : null;
}

function problemText(e: unknown): string {
  if (e instanceof NotPrivateError) return 'This repository is public, but student data must be private. Make the repository private in GitHub, then try again.';
  if (e instanceof AuthError) return 'GitHub did not accept the token, or it cannot reach that repository. The token may have expired.';
  if (e instanceof NetworkError) return 'Cannot reach GitHub. Check your internet connection.';
  return (e as Error).message || 'Something went wrong.';
}

export function App({ deps = {} }: { deps?: AppDeps }) {
  const [vault, setVault] = useState(loadVault());
  const [session, setSession] = useState<Session | null>(null);
  const [settings, setSettings] = useState<Settings>(loadSettings());
  // A saved device-locked token or a setup link means we open straight in; never flash the connect screen.
  const setup = useRef(decodeSetupLink(location.hash));
  const [booting, setBooting] = useState(Boolean(setup.current) || Boolean(vault && !needsPin(vault)));
  const [problem, setProblem] = useState<string | null>(null);
  const token = useRef('');

  const makeLocal = () => (deps.local ? deps.local() : new IdbLocalStore());

  function start(storage: GitHubStorage) {
    const s = createSession(storage, makeLocal(), deps.debounceMs);
    setSession(s);
    void s.syncNow();
  }

  async function open(rec: VaultRecord, tok: string): Promise<string | null> {
    const storage = new GitHubStorage({ owner: rec.owner, repo: rec.repo, token: tok, fetchImpl: deps.fetchImpl });
    try {
      await storage.verifyPrivate();
    } catch (e) {
      // Offline is fine: the saved copy still works. Anything else blocks.
      if (!(e instanceof NetworkError)) return problemText(e);
    }
    token.current = tok;
    start(storage);
    return null;
  }

  async function connect(repoInput: string, tok: string): Promise<string | null> {
    const parsed = parseRepo(repoInput);
    if (!parsed) return 'Enter the repository as owner/name, for example priya/tuition-data.';
    if (!tok.trim()) return 'Paste the access token.';
    const storage = new GitHubStorage({ ...parsed, token: tok.trim(), fetchImpl: deps.fetchImpl });
    try {
      await storage.verifyPrivate();
    } catch (e) {
      return problemText(e);
    }
    const rec = await sealTokenDevice(tok.trim(), parsed);
    saveVault(rec);
    setVault(rec);
    token.current = tok.trim();
    start(storage);
    return null;
  }

  async function boot() {
    setProblem(null);
    setBooting(true);
    try {
      if (setup.current) {
        const link = setup.current;
        history.replaceState(null, '', location.pathname + location.search); // drop the token from the address bar
        setup.current = null;
        const err = await connect(link.repo, link.token);
        if (err) setProblem(err);
      } else if (vault && !needsPin(vault)) {
        const err = await open(vault, await openTokenDevice(vault));
        if (err) setProblem(err);
      }
    } catch (e) {
      setProblem(problemText(e));
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    if (booting) void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function unlock(pin: string): Promise<string | null> {
    if (!vault) return 'Not connected.';
    let tok: string;
    try {
      tok = await openToken(vault, pin);
    } catch {
      return 'Wrong PIN.';
    }
    return open(vault, tok);
  }

  async function setPin(pin: string): Promise<string | null> {
    if (!vault) return 'Not connected.';
    if (!isValidPin(pin)) return 'PIN must be 4 to 8 digits.';
    const rec = await sealToken(token.current, pin, vault);
    saveVault(rec);
    setVault(rec);
    return null;
  }

  async function removePin() {
    if (!vault) return;
    const rec = await sealTokenDevice(token.current, vault);
    saveVault(rec);
    setVault(rec);
  }

  function lock() {
    session?.dispose();
    setSession(null);
  }

  async function disconnect() {
    session?.dispose();
    await (session?.local ?? makeLocal()).clear();
    clearVault();
    await clearDeviceKey();
    token.current = '';
    setProblem(null);
    setVault(null);
    setSession(null);
  }

  if (problem) return <ProblemScreen message={problem} onRetry={() => void boot()} onReconnect={disconnect} />;
  if (booting) return <OpeningScreen />;
  if (!vault) return <ConnectScreen onSubmit={connect} />;
  if (!session) return <LockScreen repoName={`${vault.owner}/${vault.repo}`} onUnlock={unlock} onForget={disconnect} />;
  return (
    <Shell
      session={session}
      settings={settings}
      pinOn={needsPin(vault)}
      onSettings={setSettings}
      onLock={lock}
      onSetPin={setPin}
      onRemovePin={removePin}
      setupLink={() => encodeSetupLink(location.origin + location.pathname, `${vault.owner}/${vault.repo}`, token.current)}
      onDisconnect={disconnect}
    />
  );
}

function Shell(props: {
  session: Session; settings: Settings; pinOn: boolean; onSettings: (s: Settings) => void; onLock: () => void;
  onSetPin: (pin: string) => Promise<string | null>; onRemovePin: () => Promise<void>; setupLink: () => string; onDisconnect: () => void;
}) {
  const { session, settings } = props;
  const [tab, setTab] = useState<Tab>('home');
  const [adding, setAdding] = useState(false);
  const goto = (t: Tab, opts?: { addStudent?: boolean }) => { setAdding(Boolean(opts?.addStudent)); setTab(t); window.scrollTo(0, 0); };
  const [sync, setSync] = useState<SyncState>(session.getState());
  const hiddenAt = useRef<number | null>(null);

  useEffect(() => {
    setSync(session.getState()); // catch a result that arrived before we subscribed
    return session.subscribe(setSync);
  }, [session]);

  // With a PIN set, lock again after 5 minutes in the background.
  useEffect(() => {
    if (!props.pinOn) return;
    const onVis = () => {
      if (document.hidden) hiddenAt.current = Date.now();
      else if (hiddenAt.current && Date.now() - hiddenAt.current > 5 * 60_000) props.onLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [props.pinOn, props.onLock]);

  const expiry = daysUntilExpiry(session.tokenExpiry());
  const syncText =
    sync.status === 'syncing' ? 'Syncing...'
    : sync.status === 'offline' ? `Offline${sync.pending ? ` · ${sync.pending} waiting` : ''}`
    : sync.status === 'auth' ? 'Token problem'
    : sync.status === 'error' ? 'Sync problem'
    : sync.pending ? `${sync.pending} waiting` : 'Synced';

  return (
    <div class="shell">
      <header class="topbar">
        <span class="brand"><BrandMark size={32} onDark /> {TITLES[tab]}</span>
        <button type="button" class={`sync sync-${sync.status}`} onClick={() => session.syncNow()} aria-label={`Sync status: ${syncText}. Tap to sync`}>
          <span class="sync-dot" aria-hidden="true" />
          {syncText}
        </button>
      </header>
      {expiry !== null && expiry <= 14 && (
        <p class="banner" role="alert">{expiry < 0 ? 'Your access token has expired.' : `Your access token expires in ${expiry} day(s).`} Create a new one in GitHub and reconnect (More).</p>
      )}
      {sync.status === 'auth' && <p class="banner" role="alert">GitHub rejected the token. Your changes are saved on this phone and will upload once you reconnect with a valid token.</p>}
      <main class="content">
        {tab === 'home' && <HomeScreen store={session.store} settings={settings} goto={goto} />}
        {tab === 'attendance' && <AttendanceScreen store={session.store} />}
        {tab === 'students' && <StudentsScreen store={session.store} startAdding={adding} />}
        {tab === 'fees' && <FeesScreen store={session.store} settings={settings} />}
        {tab === 'reports' && (
          <>
            <div class="screen backrow"><button class="btn quiet small" type="button" onClick={() => goto('home')}><IconBack size={18} /> Home</button></div>
            <ReportsScreen store={session.store} />
          </>
        )}
        {tab === 'more' && (
          <MoreScreen
            session={session} settings={settings} pinOn={props.pinOn} onSettings={props.onSettings}
            onSetPin={props.onSetPin} onRemovePin={props.onRemovePin} setupLink={props.setupLink}
            onLock={props.onLock} onDisconnect={props.onDisconnect}
          />
        )}
      </main>
      <nav class="tabs" aria-label="Main">
        {TABS.map(([id, label, icon]) => (
          <button key={id} type="button" class={tab === id ? 'tab active' : 'tab'} aria-current={tab === id ? 'page' : undefined} onClick={() => goto(id)}>
            <span class="pill">{icon()}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
