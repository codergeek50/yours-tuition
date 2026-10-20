// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { createFakeApps, loadServer, tabValues } from './fake-services.mjs';

let server;
let apps;
let key;

const call = (req) => server.handle({ key, ...req });
const write = (path, doc, sha = '') => call({ action: 'write', path, content: typeof doc === 'string' ? doc : JSON.stringify(doc), sha });

beforeEach(() => {
  ({ server, apps } = loadServer());
  server.setup();
  key = apps.state.props.get('KEY');
});

describe('setup', () => {
  it('creates the folder, the sheet and a long random key, and shows the connection tab', () => {
    expect(apps.state.folders.size).toBe(1);
    expect(apps.state.spreadsheets.size).toBe(1);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const conn = tabValues(apps, 'Connection');
    expect(conn.map((r) => r[0])).toEqual([expect.stringContaining('Keep this tab private'), 'Web app address', 'Secret key', 'Setup link for a phone']);
    expect(conn[1][1]).toBe('https://script.google.com/macros/s/FAKEDEPLOYMENTID/exec');
    expect(conn[2][1]).toBe(key);
  });
  it('is safe to run again: the key and files are not replaced', () => {
    server.setup();
    expect(apps.state.props.get('KEY')).toBe(key);
    expect(apps.state.folders.size).toBe(1);
    expect(apps.state.spreadsheets.size).toBe(1);
  });
  it('the setup link decodes to the address and the key', () => {
    const link = tabValues(apps, 'Connection')[3][1];
    expect(link.startsWith('https://codergeek50.github.io/yours-tuition/#setup=')).toBe(true);
    const payload = link.split('#setup=')[1];
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    expect(JSON.parse(json)).toEqual({ r: 'https://script.google.com/macros/s/FAKEDEPLOYMENTID/exec', t: key });
  });
});

describe('the secret key', () => {
  it('refuses a missing or wrong key for every action, and changes nothing', async () => {
    for (const action of ['ping', 'snapshot', 'read', 'list', 'write']) {
      for (const k of [undefined, '', 'wrong', key + 'x', key.slice(0, -1)]) {
        expect(server.handle({ key: k, action, path: 'students.json', dir: 'attendance', content: '{"students":[]}', sha: '' })).toEqual({ ok: false, error: 'auth' });
      }
    }
    expect(apps.state.files.size).toBe(1); // only the sheet
  });
  it('says not_setup before setup has run', () => {
    const fresh = loadServer().server;
    expect(fresh.handle({ key: 'anything', action: 'ping' })).toEqual({ ok: false, error: 'not_setup' });
  });
  it('compares in a way that does not depend on where the strings differ', () => {
    expect(server.safeEqual('abc', 'abc')).toBe(true);
    expect(server.safeEqual('abc', 'abd')).toBe(false);
    expect(server.safeEqual('abc', 'abcd')).toBe(false);
    expect(server.safeEqual('', '')).toBe(true);
    expect(server.safeEqual('', 'a')).toBe(false);
  });
  it('rotateKey stops the old key working and the new one works', () => {
    server.rotateKey();
    const next = apps.state.props.get('KEY');
    expect(next).not.toBe(key);
    expect(server.handle({ key, action: 'ping' })).toEqual({ ok: false, error: 'auth' });
    expect(server.handle({ key: next, action: 'ping' }).ok).toBe(true);
    expect(tabValues(apps, 'Connection')[2][1]).toBe(next);
  });
});

describe('web app address', () => {
  const fresh = (url) => {
    const a = createFakeApps({ deployedUrl: url });
    const { server: s } = loadServer(a);
    s.setup();
    return { a, s };
  };
  it('never shows the editor test address (/dev): it only works for the owner', () => {
    const { a } = fresh('https://script.google.com/macros/s/TESTID/dev');
    const cell = tabValues(a, 'Connection')[1][1];
    expect(cell).not.toContain('/dev');
    expect(cell).toContain('open the web app address once');
  });
  it('remembers the live address from a request, then shows it even when run from the editor', () => {
    const { a, s } = fresh('https://script.google.com/macros/s/LIVEID/exec');
    s.doGet({});
    a.state.deployedUrl = 'https://script.google.com/macros/s/TESTID/dev';
    s.showConnection();
    expect(tabValues(a, 'Connection')[1][1]).toBe('https://script.google.com/macros/s/LIVEID/exec');
  });
  it('a request that is not the live address records nothing', () => {
    const { a, s } = fresh('https://script.google.com/macros/s/TESTID/dev');
    s.doGet({});
    expect(a.state.props.get('EXEC_URL')).toBeUndefined();
  });
});

describe('ping, read, write', () => {
  it('ping identifies the app and gives the sheet address', () => {
    expect(call({ action: 'ping' })).toMatchObject({ ok: true, app: 'yours-tuition', protocol: 1, sheetUrl: expect.stringContaining('docs.google.com/spreadsheets') });
  });
  it('creates a file at version 1, reads it back, and bumps the version on update', () => {
    expect(write('students.json', { students: [] })).toEqual({ ok: true, sha: '1' });
    expect(call({ action: 'read', path: 'students.json' })).toEqual({ ok: true, found: true, content: '{"students":[]}', sha: '1' });
    expect(write('students.json', { students: [{ id: 'a', name: 'Asha' }] }, '1')).toEqual({ ok: true, sha: '2' });
    expect(call({ action: 'read', path: 'students.json' }).sha).toBe('2');
  });
  it('a missing file reads as not found', () => {
    expect(call({ action: 'read', path: 'teachers.json' })).toEqual({ ok: true, found: false });
  });
  it('rejects a stale version, creating over an existing file, and updating without a version', () => {
    write('students.json', { students: [] });
    expect(write('students.json', { students: [] }, '7')).toEqual({ ok: false, error: 'conflict' });
    expect(write('students.json', { students: [] }, '')).toEqual({ ok: false, error: 'conflict' });
    expect(write('teachers.json', { teachers: [] }, '1')).toEqual({ ok: false, error: 'conflict' });
    expect(call({ action: 'read', path: 'students.json' }).sha).toBe('1');
  });
  it('two writes from the same version: the first wins, the second conflicts', () => {
    write('meta.json', { schemaVersion: 1, nextReceiptNumber: 1 });
    expect(write('meta.json', { schemaVersion: 1, nextReceiptNumber: 2 }, '1').ok).toBe(true);
    expect(write('meta.json', { schemaVersion: 1, nextReceiptNumber: 3 }, '1')).toEqual({ ok: false, error: 'conflict' });
  });
  it('always releases the lock, including on a conflict and on bad input', () => {
    write('students.json', { students: [] });
    write('students.json', { students: [] }, 'old');
    write('students.json', 'not json');
    expect(apps.state.lock.held).toBe(0);
  });
});

describe('what the server will accept', () => {
  it('only the app\'s own file names', () => {
    for (const path of ['../evil.json', 'README.md', '.github/workflows/x.yml', 'attendance/2026-13.json', 'attendance/2026-10.json/../x', 'visits/2026-1.json', '/etc/passwd', 'students.json ', 'Students.json']) {
      expect(call({ action: 'read', path })).toEqual({ ok: false, error: 'bad_request' });
      expect(write(path, { students: [] })).toEqual({ ok: false, error: 'bad_request' });
    }
    expect(server.isAllowedPath('visits/2026-10.json')).toBe(true);
  });
  it('content must be JSON text of the right shape', () => {
    expect(write('students.json', 'not json')).toEqual({ ok: false, error: 'bad_request' });
    expect(write('students.json', '[]')).toEqual({ ok: false, error: 'bad_request' });
    expect(write('students.json', { teachers: [] })).toEqual({ ok: false, error: 'bad_request' });
    expect(write('payments/2026-10.json', { visits: [] })).toEqual({ ok: false, error: 'bad_request' });
    expect(call({ action: 'write', path: 'students.json', content: 42, sha: '' })).toEqual({ ok: false, error: 'bad_request' });
  });
  it('refuses files over the size cap', () => {
    const big = JSON.stringify({ students: [{ id: 'x', name: 'a'.repeat(1_000_001) }] });
    expect(write('students.json', big)).toEqual({ ok: false, error: 'too_large' });
  });
  it('unknown actions and a bad post body are rejected', () => {
    expect(call({ action: 'delete' })).toEqual({ ok: false, error: 'bad_request' });
    expect(JSON.parse(server.doPost({ postData: { contents: 'nope' } }).getContent())).toEqual({ ok: false, error: 'bad_request' });
  });
  it('doPost answers JSON, and the key-free GET shows no data', () => {
    write('students.json', { students: [{ id: 'a', name: 'Secret Name' }] });
    const post = JSON.parse(server.doPost({ postData: { contents: JSON.stringify({ key, action: 'ping' }) } }).getContent());
    expect(post.ok).toBe(true);
    const get = server.doGet({ parameter: { action: 'snapshot', key } }).getContent();
    expect(JSON.parse(get)).toEqual({ ok: true, app: 'yours-tuition', protocol: 1 });
    expect(get).not.toContain('Secret Name');
  });
});

describe('snapshot and list', () => {
  it('snapshot returns every app file with its version, and ignores anything else in the folder', () => {
    write('students.json', { students: [] });
    write('attendance/2026-10.json', { days: {} });
    write('attendance/2026-10.json', { days: { '2026-10-01': { a: 'P' } } }, '1');
    const folderId = [...apps.state.folders.keys()][0];
    apps.state.files.set('stray', { id: 'stray', name: 'notes.txt', content: 'hello', parentId: folderId });
    const snap = call({ action: 'snapshot' });
    expect(Object.keys(snap.files).sort()).toEqual(['attendance/2026-10.json', 'students.json']);
    expect(snap.files['attendance/2026-10.json'].sha).toBe('2');
    expect(JSON.parse(snap.files['students.json'].content)).toEqual({ students: [] });
  });
  it('list returns the paths in one folder, and rejects other folders', () => {
    write('visits/2026-09.json', { visits: [] });
    write('visits/2026-10.json', { visits: [] });
    write('payments/2026-10.json', { payments: [] });
    expect(call({ action: 'list', dir: 'visits' })).toEqual({ ok: true, paths: ['visits/2026-09.json', 'visits/2026-10.json'] });
    expect(call({ action: 'list', dir: 'secrets' })).toEqual({ ok: false, error: 'bad_request' });
    expect(call({ action: 'list', dir: '../x' })).toEqual({ ok: false, error: 'bad_request' });
  });
});

describe('the readable sheet', () => {
  it('Students and Teachers tabs list each person', () => {
    write('students.json', { students: [
      { id: 'b', name: 'Bala', grade: '9', school: 'DAV', guardianName: 'M', guardianPhone: '98', monthlyFee: 1000, joinedOn: '2026-01-01', active: true },
      { id: 'a', name: 'Asha', grade: '8', school: 'St Mary', guardianName: 'R', guardianPhone: '97', monthlyFee: 1500, joinedOn: '2026-01-02', active: false },
    ] });
    write('teachers.json', { teachers: [{ id: 't', name: 'Mr Rao', subject: 'Maths', phone: '', usualAmount: 800, active: true }] });
    const s = tabValues(apps, 'Students');
    expect(s[0]).toEqual(['Name', 'Class', 'School', 'Guardian', 'Guardian phone', 'Monthly fee (Rs)', 'Joined', 'Active']);
    expect(s.slice(1).map((r) => [r[0], r[7]])).toEqual([['Asha', 'No'], ['Bala', 'Yes']]);
    expect(tabValues(apps, 'Teachers')[1]).toEqual(['Mr Rao', 'Maths', '', 800, 'Yes']);
  });

  it('text that would run as a formula is made harmless', () => {
    write('students.json', { students: [{ id: 'x', name: '=HYPERLINK("http://evil","click")', grade: '+1', school: '-2', guardianName: '@sum', guardianPhone: '\t=1', monthlyFee: 100, joinedOn: '2026-01-01', active: true }] });
    const row = tabValues(apps, 'Students')[1];
    expect(row.slice(0, 5)).toEqual(['\'=HYPERLINK("http://evil","click")', "'+1", "'-2", "'@sum", "'\t=1"]);
    expect(row[5]).toBe(100); // numbers stay numbers
    expect(server.safeCell('=1+1')).toBe("'=1+1");
    expect(server.safeCell('Asha')).toBe('Asha');
    expect(server.safeCell(null)).toBe('');
  });

  it('Payments tab lists receipts in number order and marks voided ones', () => {
    write('payments/2026-10.json', { payments: [
      { id: 'p2', studentId: 's', forMonth: '2026-10', amount: 600, paidOn: '2026-10-05', mode: 'upi', receipt: { number: 2, studentName: 'Asha', balanceAfter: 0, voided: true, voidReason: 'typo' } },
      { id: 'p1', studentId: 's', forMonth: '2026-10', amount: 400, paidOn: '2026-10-03', mode: 'cash', receipt: { number: 1, studentName: 'Asha', balanceAfter: 600, voided: false } },
    ] });
    const rows = tabValues(apps, 'Payments');
    expect(rows[1]).toEqual([1, '2026-10-03', 'Asha', '2026-10', 400, 'cash', 600, 'Paid']);
    expect(rows[2][7]).toBe('VOID - typo');
  });

  it('Visits tab joins teachers, hides deleted visits, and treats old visits as paid', () => {
    write('teachers.json', { teachers: [{ id: 't', name: 'Mr Rao', subject: 'Maths', phone: '', usualAmount: 0, active: true }] });
    write('visits/2026-10.json', { visits: [
      { id: 'a', teacherId: 't', date: '2026-10-02', hours: 2, amount: 800, note: 'old shape', deleted: false },
      { id: 'b', teacherId: 't', date: '2026-10-03', hours: 1.5, amount: 600, note: '', paid: false, paidOn: '', deleted: false },
      { id: 'c', teacherId: 't', date: '2026-10-04', hours: 9, amount: 9999, note: '', deleted: true },
    ] });
    const rows = tabValues(apps, 'Visits');
    expect(rows.length).toBe(3);
    expect(rows[1]).toEqual(['2026-10-02', 'Mr Rao', 'Maths', 2, 800, 'Paid', '2026-10-02', 'old shape']);
    expect(rows[2].slice(5, 7)).toEqual(['Pending', '']);
  });

  it('Attendance tab is a register of students by date with totals, named from the Students file', () => {
    write('students.json', { students: [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bala' }] });
    write('attendance/2026-10.json', { days: { '2026-10-02': { a: 'P', b: 'L' }, '2026-10-01': { a: 'A', b: 'P' } } });
    const rows = tabValues(apps, 'Attendance 2026-10');
    expect(rows[0]).toEqual(['Student', '2026-10-01', '2026-10-02', 'Present', 'Absent', 'Leave']);
    expect(rows[1]).toEqual(['Asha', 'A', 'P', 1, 1, 0]);
    expect(rows[2]).toEqual(['Bala', 'P', 'L', 1, 0, 1]);
  });

  it('renaming a student refreshes the attendance tabs that show the name', () => {
    write('students.json', { students: [{ id: 'a', name: 'Asha' }] });
    write('attendance/2026-10.json', { days: { '2026-10-01': { a: 'P' } } });
    write('students.json', { students: [{ id: 'a', name: 'Asha Rao' }] }, '1');
    expect(tabValues(apps, 'Attendance 2026-10')[1][0]).toBe('Asha Rao');
  });

  it('a problem with the sheet never fails a save', () => {
    apps.state.failSheets = true;
    expect(write('students.json', { students: [{ id: 'a', name: 'Asha' }] })).toEqual({ ok: true, sha: '1' });
    expect(call({ action: 'read', path: 'students.json' }).found).toBe(true);
    expect(apps.state.logs.some((l) => l.includes('view refresh failed'))).toBe(true);
    expect(apps.state.logs.join(' ')).not.toContain('Asha');
  });
});
