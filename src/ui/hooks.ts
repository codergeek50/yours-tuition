import { useEffect, useState } from 'preact/hooks';

/** Runs an async loader whenever deps change; `reload` re-runs it after a save. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | undefined; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    fn().then((d) => {
      if (live) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, reload: () => setTick((t) => t + 1) };
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
