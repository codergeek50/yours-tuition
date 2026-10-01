import { useState } from 'preact/hooks';
import { todayISO } from '../domain/dates';
import { daysUntilExpiry } from '../vault/vault';
import type { Session } from '../app/session';
import { saveSettings, type Settings } from '../app/settings';
import { Field, val } from './common';
import { downloadText } from './hooks';

export interface MoreProps {
  session: Session;
  settings: Settings;
  pinOn: boolean;
  onSettings: (s: Settings) => void;
  onSetPin: (pin: string) => Promise<string | null>;
  onRemovePin: () => Promise<void>;
  setupLink: () => string;
  onDisconnect: () => void;
  onLock: () => void;
}

export function MoreScreen(props: MoreProps) {
  const { session } = props;
  const [teacher, setTeacher] = useState(props.settings.teacherName);
  const [tuition, setTuition] = useState(props.settings.tuitionName);
  const [pin, setPin] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const days = daysUntilExpiry(session.tokenExpiry());

  function saveNames(e: Event) {
    e.preventDefault();
    const next = { teacherName: teacher.trim(), tuitionName: tuition.trim() || 'Tuition Classes' };
    saveSettings(next);
    props.onSettings(next);
    setMsg('Names saved. They appear on new and reprinted receipts.');
  }

  async function turnOnPin(e: Event) {
    e.preventDefault();
    const err = await props.onSetPin(pin);
    setPin('');
    setMsg(err ?? 'PIN lock is on. The app will ask for it each time it opens.');
  }

  async function turnOffPin() {
    await props.onRemovePin();
    setMsg('PIN lock is off. The app opens straight in.');
  }

  async function exportAll() {
    downloadText(`yours-tuition-backup-${todayISO()}.json`, await session.store.exportAll(), 'application/json');
    setMsg('Backup downloaded. Keep it somewhere safe.');
  }

  async function importFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!window.confirm('Restore from this backup? It replaces the data on this phone and uploads it to your data repository.')) return;
    try {
      await session.store.importAll(await file.text());
      await session.syncNow();
      setMsg('Backup restored.');
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setMsg('Link copied.');
    } catch {
      setMsg('Could not copy. Select the link and copy it by hand.');
    }
  }

  return (
    <div class="screen">
      <h2>More</h2>
      <form class="card" onSubmit={saveNames}>
        <h3>Receipt details</h3>
        <Field label="Tuition name"><input value={tuition} onInput={(e) => setTuition(val(e))} autoComplete="off" /></Field>
        <Field label="Teacher name"><input value={teacher} onInput={(e) => setTeacher(val(e))} autoComplete="off" /></Field>
        <button class="btn primary" type="submit">Save names</button>
      </form>

      <section class="card">
        <h3>Sync</h3>
        <button class="btn" type="button" onClick={() => session.syncNow()}>Sync now</button>
        {days !== null && <p class={days <= 14 ? 'errors' : 'muted'}>Access token {days < 0 ? 'has expired' : `expires in ${days} day(s)`}. Create a new one in GitHub and reconnect before it expires.</p>}
      </section>

      <section class="card">
        <h3>Backup</h3>
        <p class="muted small">Your data is also kept, with full history, in your private GitHub repository. This downloads a copy you can keep.</p>
        <button class="btn" type="button" onClick={exportAll}>Export all data</button>
        <Field label="Restore from backup file"><input type="file" accept="application/json,.json" onChange={importFile} /></Field>
      </section>

      <section class="card">
        <h3>Lock</h3>
        {props.pinOn ? (
          <div class="row">
            <button class="btn" type="button" onClick={props.onLock}>Lock now</button>
            <button class="btn ghost" type="button" onClick={turnOffPin}>Turn off PIN lock</button>
          </div>
        ) : (
          <form onSubmit={turnOnPin}>
            <p class="muted small">The app opens straight in. Add a PIN if others use this phone.</p>
            <Field label="New PIN (4 to 8 digits)"><input type="password" inputMode="numeric" value={pin} onInput={(e) => setPin(val(e))} autoComplete="off" /></Field>
            <button class="btn" type="submit">Turn on PIN lock</button>
          </form>
        )}
      </section>

      <section class="card">
        <h3>Another phone</h3>
        <p class="muted small">Open this link on the other phone once and it sets itself up. Anyone with the link can read and change your tuition data, so send it privately and delete the message afterwards.</p>
        {link ? (
          <>
            <Field label="Setup link"><input readOnly value={link} onFocus={(e) => (e.target as HTMLInputElement).select()} /></Field>
            <button class="btn" type="button" onClick={copyLink}>Copy link</button>
          </>
        ) : (
          <button class="btn" type="button" onClick={() => setLink(props.setupLink())}>Show setup link for another phone</button>
        )}
      </section>

      <section class="card">
        <h3>This phone</h3>
        <button class="btn danger" type="button" onClick={() => { if (window.confirm('Remove the saved token and the offline copy from this phone? Unsynced changes will be lost.')) props.onDisconnect(); }}>Disconnect this phone</button>
      </section>
      {msg && <p class="ok" role="status">{msg}</p>}
    </div>
  );
}
