import { useEffect, useRef, useState } from 'preact/hooks';
import { AppsScriptStorage, isValidEndpoint } from './storage/appsscript';
import { AuthError, NetworkError } from './storage/types';
import { IdbLocalStore, type LocalStore } from './sync/local';
import {
  clearDeviceKey, clearVault, decodeSetupLink, encodeSetupLink, isValidPin, loadVault, needsPin,
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
import { TeachersScreen } from './ui/TeachersScreen';
import { ExpensesScreen } from './ui/ExpensesScreen';
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
const TITLES: Record<Tab, string> = { home: 'YOURS Tuition', attendance: 'Attendance', students: 'Students', fees: 'Fees', reports: 'Reports', teachers: 'Visiting teachers', expenses: 'Expenses', more: 'More' };

function problemText(e: unknown): string {
  if (e instanceof AuthError) return 'The data service did not accept the secret key. If the key was replaced, set this phone up again with the new setup link.';
  if (e instanceof NetworkError) return 'Cannot reach the data service. Check your internet connection.';
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
  const secret = useRef('');

  const makeLocal = () => (deps.local ? deps.local() : new IdbLocalStore());

  function start(storage: AppsScriptStorage) {
    const s = createSession(storage, makeLocal(), deps.debounceMs);
    setSession(s);
    void s.syncNow();
  }

  async function open(rec: VaultRecord, key: string): Promise<string | null> {
    const storage = new AppsScriptStorage({ endpoint: rec.endpoint, key, fetchImpl: deps.fetchImpl });
    try {
      await storage.verify();
    } catch (e) {
      // Offline is fine: the saved copy still works. Anything else blocks.
      if (!(e instanceof NetworkError)) return problemText(e);
    }
    secret.current = key;
    start(storage);
    return null;
  }

  async function connect(endpointInput: string, keyInput: string): Promise<string | null> {
    const endpoint = endpointInput.trim();
    const key = keyInput.trim();
    if (!isValidEndpoint(endpoint)) return 'Enter the web app address. It looks like https://script.google.com/macros/s/.../exec';
    if (!key) return 'Enter the secret key.';
    const storage = new AppsScriptStorage({ endpoint, key, fetchImpl: deps.fetchImpl });
    try {
      await storage.verify();
    } catch (e) {
      return problemText(e);
    }
    const rec = await sealTokenDevice(key, { endpoint });
    saveVault(rec);
    setVault(rec);
    secret.current = key;
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
        if (vault) {
          // Never let a link silently repoint a phone that already holds data.
          setProblem('This phone is already set up, so the setup link was ignored. Choose Try again to open the app as it is, or Reconnect to start over (this removes the data stored on this phone; it stays safe in your Google Drive).');
        } else {
          const err = await connect(link.endpoint, link.key);
          if (err) setProblem(err);
        }
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
    let key: string;
    try {
      key = await openToken(vault, pin);
    } catch {
      return 'Wrong PIN.';
    }
    return open(vault, key);
  }

  async function setPin(pin: string): Promise<string | null> {
    if (!vault) return 'Not connected.';
    if (!isValidPin(pin)) return 'PIN must be 4 to 8 digits.';
    const rec = await sealToken(secret.current, pin, vault);
    saveVault(rec);
    setVault(rec);
    return null;
  }

  async function removePin() {
    if (!vault) return;
    const rec = await sealTokenDevice(secret.current, vault);
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
    secret.current = '';
    setProblem(null);
    setVault(null);
    setSession(null);
  }

  if (problem) return <ProblemScreen message={problem} onRetry={() => void boot()} onReconnect={disconnect} />;
  if (booting) return <OpeningScreen />;
  if (!vault) return <ConnectScreen onSubmit={connect} />;
  if (!session) return <LockScreen onUnlock={unlock} onForget={disconnect} />;
  return (
    <Shell
      session={session}
      settings={settings}
      pinOn={needsPin(vault)}
      onSettings={setSettings}
      onLock={lock}
      onSetPin={setPin}
      onRemovePin={removePin}
      setupLink={() => encodeSetupLink(location.origin + location.pathname, vault.endpoint, secret.current)}
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

  const syncText =
    sync.status === 'syncing' ? 'Syncing...'
    : sync.status === 'offline' ? `Offline${sync.pending ? ` · ${sync.pending} waiting` : ''}`
    : sync.status === 'auth' ? 'Key problem'
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
      {sync.status === 'auth' && <p class="banner" role="alert">The data service did not accept the secret key. Your changes are saved on this phone and will upload once the phone is set up again with the current setup link.</p>}
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
        {tab === 'teachers' && (
          <>
            <div class="screen backrow"><button class="btn quiet small" type="button" onClick={() => goto('home')}><IconBack size={18} /> Home</button></div>
            <TeachersScreen store={session.store} />
          </>
        )}
        {tab === 'expenses' && (
          <>
            <div class="screen backrow"><button class="btn quiet small" type="button" onClick={() => goto('home')}><IconBack size={18} /> Home</button></div>
            <ExpensesScreen store={session.store} />
          </>
        )}
        {tab === 'more' && (
          <MoreScreen
            session={session} settings={settings} pinOn={props.pinOn} onSettings={props.onSettings}
            onSetPin={props.onSetPin} onRemovePin={props.onRemovePin} setupLink={props.setupLink} sheetUrl={session.sheetUrl()}
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
