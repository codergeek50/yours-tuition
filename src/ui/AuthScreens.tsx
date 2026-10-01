import { useState } from 'preact/hooks';
import { Errors, Field, val } from './common';
import { BrandMark } from './icons';

function Intro({ children }: { children?: preact.ComponentChildren }) {
  return (
    <header class="intro">
      <BrandMark size={52} />
      <h1>YOURS Tuition</h1>
      {children}
    </header>
  );
}

/** Fallback only: the teacher normally gets a ready-made setup link and never sees this. */
export function ConnectScreen({ onSubmit }: { onSubmit: (repo: string, token: string) => Promise<string | null> }) {
  const [repo, setRepo] = useState('');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(await onSubmit(repo, token));
    setBusy(false);
  }

  return (
    <main class="screen narrow">
      <Intro>
        <h2>Connect your data repository</h2>
        <p class="muted">
          Your students, attendance and fees are saved as files in a <strong>private</strong> GitHub repository that only you can open.
          Create it and a limited access token first (steps are in the project README). You only do this once.
        </p>
      </Intro>
      <form class="card" onSubmit={submit}>
        <Field label="Data repository (owner/name)"><input value={repo} onInput={(e) => setRepo(val(e))} autoCapitalize="off" autoComplete="off" spellcheck={false} /></Field>
        <Field label="Access token" hint="Kept encrypted on this phone and only ever sent to GitHub."><input type="password" value={token} onInput={(e) => setToken(val(e))} autoComplete="off" /></Field>
        <Errors errors={error ? [error] : []} />
        <button class="btn primary wide" type="submit" disabled={busy}>{busy ? 'Checking...' : 'Connect'}</button>
      </form>
    </main>
  );
}

export function OpeningScreen() {
  return (
    <main class="screen narrow">
      <Intro>
        <p class="muted" role="status">Opening your tuition...</p>
      </Intro>
    </main>
  );
}

export function ProblemScreen(props: { message: string; onRetry: () => void; onReconnect: () => void }) {
  return (
    <main class="screen narrow">
      <Intro />
      <p class="errors" role="alert">{props.message}</p>
      <div class="form-actions">
        <button class="btn primary wide" type="button" onClick={props.onRetry}>Try again</button>
        <button class="btn wide" type="button" onClick={props.onReconnect}>Reconnect</button>
      </div>
    </main>
  );
}

/** Only shown when the teacher has chosen to protect the app with a PIN. */
export function LockScreen(props: { repoName: string; onUnlock: (pin: string) => Promise<string | null>; onForget: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(await props.onUnlock(pin));
    setPin('');
    setBusy(false);
  }

  return (
    <main class="screen narrow">
      <Intro>
        <p class="muted">Connected to {props.repoName}</p>
      </Intro>
      <form class="card" onSubmit={submit}>
        <Field label="PIN"><input type="password" inputMode="numeric" value={pin} onInput={(e) => setPin(val(e))} autoComplete="off" /></Field>
        <Errors errors={error ? [error] : []} />
        <button class="btn primary wide" type="submit" disabled={busy}>{busy ? 'Checking...' : 'Unlock'}</button>
      </form>
      <button class="btn quiet" type="button" onClick={props.onForget}>Forgot PIN? Reconnect</button>
    </main>
  );
}
