export type Tab = 'home' | 'attendance' | 'students' | 'fees' | 'reports' | 'more';
export type Goto = (tab: Tab, opts?: { addStudent?: boolean }) => void;
