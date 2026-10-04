import { useErrorBoundary } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { BrandMark } from './icons';

/** Last line of defence: an unexpected error shows a calm screen instead of a blank page. Saved data is untouched. */
export function CrashGuard({ children }: { children: ComponentChildren }) {
  const [error] = useErrorBoundary((e) => {
    console.error('YOURS Tuition crashed', e);
  });
  if (!error) return <>{children}</>;
  return (
    <main class="screen narrow">
      <header class="intro">
        <BrandMark size={52} />
        <h1>YOURS Tuition</h1>
      </header>
      <p class="errors" role="alert">Something went wrong. Your students, attendance and fees are safe; nothing was lost.</p>
      <button class="btn primary wide" type="button" onClick={() => location.reload()}>Reload the app</button>
    </main>
  );
}
