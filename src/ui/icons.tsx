import type { ComponentChildren } from 'preact';

/** One consistent stroke-icon set (24px grid, 2px round stroke). Decorative: always aria-hidden. */
function Svg({ children, size = 24, fill = 'none' }: { children: ComponentChildren; size?: number; fill?: string }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const IconCheck = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconMinus = (p: P) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconLeft = (p: P) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const IconRight = (p: P) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="m12 19-7-7 7-7M19 12H5" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const IconAttendance = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8.5 12.5 2.5 2.5 4.5-5" /></Svg>;
export const IconStudents = (p: P) => (
  <Svg {...p}><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="10" cy="8" r="3.5" /><path d="M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.65a3.5 3.5 0 0 1 0 6.7" /></Svg>
);
export const IconFees = (p: P) => <Svg {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></Svg>;
export const IconReports = (p: P) => <Svg {...p}><path d="M4 4v16h16" /><path d="M9 16v-4M13 16V8M17 16v-6" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Svg>;
export const IconChat = (p: P) => <Svg {...p}><path d="M7.9 20A9 9 0 1 0 4 16.1L2.5 21.5Z" /></Svg>;
export const IconPrint = (p: P) => <Svg {...p}><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.3L3 16M3 21v-5h5" /></Svg>;
export const IconHome = (p: P) => <Svg {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5v-5h4v5" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconUserPlus = (p: P) => <Svg {...p}><path d="M15 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-4A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="9.5" cy="8" r="3.5" /><path d="M19 8v6M16 11h6" /></Svg>;
export const IconReceipt = (p: P) => <Svg {...p}><path d="M5 3v18l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2V3l-2 1.2L14 3l-2 1.2L10 3 8 4.2z" /><path d="M9 8h6M9 12h6M9 16h3" /></Svg>;

/** Brand mark: rounded tile with a "Y". onDark flips it to a white tile for the blue top bar. */
export function BrandMark({ size = 32, onDark = false }: P & { onDark?: boolean }) {
  return (
    <svg class="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="9" fill={onDark ? '#fff' : 'var(--primary)'} />
      <path d="M9.5 8.5 16 17l6.5-8.5M16 17v7" stroke={onDark ? 'var(--primary)' : '#fff'} stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      <circle cx="24.5" cy="24.5" r="2.4" fill="var(--accent)" />
    </svg>
  );
}
