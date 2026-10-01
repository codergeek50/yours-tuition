import type { ComponentChildren } from 'preact';

export const val = (e: Event) => (e.target as HTMLInputElement).value;

export function Field(props: { label: string; hint?: string; hideLabel?: boolean; children: ComponentChildren }) {
  return (
    <div class="field">
      <label>
        <span class={props.hideLabel ? 'sr-only' : 'field-label'}>{props.label}</span>
        {props.children}
      </label>
      {props.hint && <span class="field-hint">{props.hint}</span>}
    </div>
  );
}

export function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul class="errors" role="alert">
      {errors.map((e) => (
        <li key={e}>{e}</li>
      ))}
    </ul>
  );
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal" role="dialog" aria-label={props.title}>
        <div class="modal-grip" aria-hidden="true" />
        <div class="modal-head">
          <h2>{props.title}</h2>
          <button type="button" class="btn quiet small" onClick={props.onClose}>Close</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

const HUES = [165, 205, 255, 305, 20, 75];

/** Soft coloured initial, stable per name, so rows are easy to tell apart at a glance. */
export function Avatar({ name }: { name: string }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return (
    <span class="avatar" style={{ '--h': HUES[h % HUES.length] } as Record<string, number>} aria-hidden="true">
      {initial}
    </span>
  );
}

export function PageHeader(props: { title: string; sub?: string; action?: ComponentChildren }) {
  return (
    <div class="page-head">
      <div>
        <h2>{props.title}</h2>
        {props.sub && <p class="muted">{props.sub}</p>}
      </div>
      {props.action}
    </div>
  );
}

export function Empty(props: { title: string; text: string; action?: ComponentChildren }) {
  return (
    <div class="empty">
      <p class="empty-title">{props.title}</p>
      <p class="muted">{props.text}</p>
      {props.action}
    </div>
  );
}
