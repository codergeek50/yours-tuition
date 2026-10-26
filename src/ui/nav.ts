export type Tab = 'home' | 'attendance' | 'students' | 'fees' | 'reports' | 'teachers' | 'expenses' | 'more';
export type Goto = (tab: Tab, opts?: { addStudent?: boolean }) => void;
