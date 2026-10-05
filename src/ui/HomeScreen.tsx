import { monthOf, todayISO } from '../domain/dates';
import { balanceFor } from '../domain/fees';
import { formatRupees } from '../domain/money';
import type { DataStore } from '../data/store';
import type { Settings } from '../app/settings';
import { useLoad } from './hooks';
import type { Goto } from './nav';
import { IconAttendance, IconFees, IconReports, IconStudents, IconTeacher, IconUserPlus } from './icons';

export function HomeScreen({ store, settings, goto }: { store: DataStore; settings: Settings; goto: Goto }) {
  const today = todayISO();
  const month = monthOf(today);
  const { data } = useLoad(async () => {
    const [students, attendance, payments, visits] = await Promise.all([store.students(), store.attendance(month), store.payments(month), store.visits(month)]);
    return { students, day: attendance.days[today], payments, visits };
  }, [store]);

  const students = data?.students ?? [];
  const active = students.filter((s) => s.active);
  const day = data?.day;
  const present = active.filter((s) => (day?.[s.id] ?? 'P') === 'P').length;
  const absent = active.filter((s) => day?.[s.id] === 'A').length;
  const leave = active.filter((s) => day?.[s.id] === 'L').length;
  const pending = active.reduce((n, s) => n + Math.max(balanceFor(s, month, data?.payments ?? []), 0), 0);
  const teacherPaid = (data?.visits ?? []).reduce((n, v) => n + v.amount, 0);
  const name = settings.teacherName.trim();
  const dateText = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div class="screen home">
      <section class="greet">
        <div class="greet-top">
          <span class="greet-avatar" aria-hidden="true">{(name[0] ?? 'T').toUpperCase()}</span>
          <div>
            <h2>Hello, {name || 'Teacher'}</h2>
            <p class="muted">{dateText}</p>
          </div>
        </div>

        {data && active.length === 0 && (
          <div class="today today-warn">
            <div><b>Welcome!</b><span>Add your first student to begin.</span></div>
            <button class="btn primary small" type="button" onClick={() => goto('students', { addStudent: true })}>Add student</button>
          </div>
        )}
        {data && active.length > 0 && !day && (
          <div class="today today-warn">
            <div><b>Attendance not taken yet</b><span>{active.length} students today</span></div>
            <button class="btn primary small" type="button" onClick={() => goto('attendance')}>Take attendance</button>
          </div>
        )}
        {data && active.length > 0 && day && (
          <div class="today today-ok">
            <div><b>Attendance is done</b><span>{present} present · {absent} absent · {leave} leave</span></div>
            <button class="btn small" type="button" onClick={() => goto('attendance')}>Review</button>
          </div>
        )}
      </section>

      <nav class="quick" aria-label="Quick actions">
        <button type="button" class="qbtn" onClick={() => goto('students', { addStudent: true })}>
          <span class="qcircle q1"><IconUserPlus size={28} /></span>Add student
        </button>
        <button type="button" class="qbtn" onClick={() => goto('fees')}>
          <span class="qcircle q2"><IconFees size={28} /></span>Collect fee
        </button>
        <button type="button" class="qbtn" onClick={() => goto('reports')}>
          <span class="qcircle q3"><IconReports size={28} /></span>Reports
        </button>
        <button type="button" class="qbtn" onClick={() => goto('teachers')}>
          <span class="qcircle q4"><IconTeacher size={28} /></span>Teachers
        </button>
      </nav>

      <h3>Today at a glance</h3>
      <div class="tiles">
        <button type="button" class="tile tile-orange" onClick={() => goto('attendance')}>
          <IconAttendance size={64} />
          <span class="tile-sub">{day ? `${present} present · ${absent} absent` : 'Not taken yet'}</span>
          <b>Mark attendance</b>
        </button>
        <button type="button" class="tile tile-cyan" onClick={() => goto('students')}>
          <IconStudents size={64} />
          <span class="tile-sub">{active.length} active</span>
          <b>Students</b>
        </button>
        <button type="button" class="tile tile-purple" onClick={() => goto('fees')}>
          <IconFees size={64} />
          <span class="tile-sub">{pending > 0 ? `${formatRupees(pending)} to collect` : active.length ? 'All collected' : 'No fees yet'}</span>
          <b>Fees</b>
        </button>
        <button type="button" class="tile tile-green" onClick={() => goto('reports')}>
          <IconReports size={64} />
          <span class="tile-sub">Download CSV</span>
          <b>Reports</b>
        </button>
        <button type="button" class="tile tile-wide tile-neutral" onClick={() => goto('teachers')}>
          <IconTeacher size={64} />
          <span class="tile-sub">{teacherPaid > 0 ? `${formatRupees(teacherPaid)} paid this month` : 'Record a visit'}</span>
          <b>Visiting teachers</b>
        </button>
      </div>
    </div>
  );
}
