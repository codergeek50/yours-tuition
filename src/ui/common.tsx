import type { ComponentChildren } from 'preact';

export const val = (e: Event) => (e.target as HTMLInputElement).value;

export function Field(props: { label: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="field-label">{props.label}</span>
      {props.children}
    </label>
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

export function Modal(props: { title: string; onClose: () => void; children: ComponentChildren }) {
  return (
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-label={props.title}>
        <div class="modal-head">
          <h2>{props.title}</h2>
          <button type="button" class="btn ghost" onClick={props.onClose}>Close</button>
        </div>
        {props.children}
      </div>
    </div>
  );
}
