export type Tab = 'home' | 'attendance' | 'students' | 'fees' | 'reports' | 'teachers' | 'more';
export type Goto = (tab: Tab, opts?: { addStudent?: boolean }) => void;
