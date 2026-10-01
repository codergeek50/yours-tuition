export interface Settings { teacherName: string; tuitionName: string }

const KEY = 'yt.settings';
const DEFAULTS: Settings = { teacherName: '', tuitionName: 'Tuition Classes' };

/** Non-secret, per-device preferences used on receipts. */
export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable; receipts then use defaults */
  }
}
