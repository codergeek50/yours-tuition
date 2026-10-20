/**
 * YOURS Tuition: data service. Runs for free in the owner's Google account as an Apps Script web app.
 *
 *  - Keeps each logical file (students.json, attendance/2026-10.json, ...) as a file in a Drive folder,
 *    with a per-file version counter so two phones can never silently overwrite each other.
 *  - Keeps a Google Sheet of readable tabs (Students, Teachers, Payments, Visits, Attendance by month).
 *    The Sheet is a read-only view rebuilt from the files; edits made in it are overwritten.
 *  - Every request must carry the secret key made by setup(). Without it nothing is returned or changed.
 *
 * One-time steps are in apps-script/README.md. Nothing in this file contains a secret.
 */

var APP = 'yours-tuition';
var PROTOCOL = 1;
var FOLDER_NAME = 'YOURS Tuition data';
var SHEET_NAME = 'YOURS Tuition data (read-only view)';
var MAX_CHARS = 1000000;
var APP_URL = 'https://codergeek50.github.io/yours-tuition/';
var PATH_RE = /^(students\.json|teachers\.json|meta\.json|(attendance|payments|visits)\/\d{4}-(0[1-9]|1[0-2])\.json)$/;
var DIRS = ['attendance', 'payments', 'visits'];

// ------------------------------------------------------------------ pure helpers

/** Compares two strings in time that depends only on their length, not on where they differ. */
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function isAllowedPath(path) {
  return typeof path === 'string' && PATH_RE.test(path);
}

function fileNameFor(path) {
  return path.replace('/', '__');
}

function pathForName(name) {
  var path = String(name).replace('__', '/');
  return isAllowedPath(path) ? path : null;
}

/** Text that a spreadsheet would run as a formula gets a leading apostrophe. Numbers and booleans are left alone. */
function safeCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  var s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function table(header, rows) {
  return [header].concat(rows).map(function (r) {
    return r.map(safeCell);
  });
}

function sortBy(list, key) {
  return list.slice().sort(function (a, b) {
    var x = key(a);
    var y = key(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

function studentsTable(doc) {
  var rows = sortBy((doc && doc.students) || [], function (s) { return String(s.name || '').toLowerCase(); }).map(function (s) {
    return [s.name, s.grade, s.school, s.guardianName, s.guardianPhone, s.monthlyFee, s.joinedOn, s.active === false ? 'No' : 'Yes'];
  });
  return table(['Name', 'Class', 'School', 'Guardian', 'Guardian phone', 'Monthly fee (Rs)', 'Joined', 'Active'], rows);
}

function teachersTable(doc) {
  var rows = sortBy((doc && doc.teachers) || [], function (t) { return String(t.name || '').toLowerCase(); }).map(function (t) {
    return [t.name, t.subject, t.phone, t.usualAmount, t.active === false ? 'No' : 'Yes'];
  });
  return table(['Name', 'Subject', 'Phone', 'Usual amount per day (Rs)', 'Visiting'], rows);
}

function paymentsTable(docs) {
  var all = [];
  docs.forEach(function (d) { (d.payments || []).forEach(function (p) { all.push(p); }); });
  var rows = sortBy(all, function (p) { return (p.receipt && p.receipt.number) || 0; }).map(function (p) {
    var r = p.receipt || {};
    return [r.number, p.paidOn, r.studentName, p.forMonth, p.amount, p.mode, r.balanceAfter, r.voided ? 'VOID' + (r.voidReason ? ' - ' + r.voidReason : '') : 'Paid'];
  });
  return table(['Receipt no.', 'Date', 'Student', 'For month', 'Amount (Rs)', 'Mode', 'Balance after (Rs)', 'Status'], rows);
}

function visitsTable(docs, teachersDoc) {
  var teachers = (teachersDoc && teachersDoc.teachers) || [];
  var all = [];
  docs.forEach(function (d) { (d.visits || []).forEach(function (v) { if (!v.deleted) all.push(v); }); });
  var rows = sortBy(all, function (v) { return String(v.date); }).map(function (v) {
    var t = teachers.filter(function (x) { return x.id === v.teacherId; })[0] || {};
    var paid = v.paid !== false; // visits saved before pay-later existed count as paid
    return [v.date, t.name || 'Unknown teacher', t.subject || '', v.hours, v.amount, paid ? 'Paid' : 'Pending', paid ? v.paidOn || v.date : '', v.note];
  });
  return table(['Date', 'Teacher', 'Subject', 'Hours', 'Amount (Rs)', 'Status', 'Paid on', 'Note'], rows);
}

function attendanceTable(monthDoc, studentsDoc) {
  var days = (monthDoc && monthDoc.days) || {};
  var dates = Object.keys(days).sort();
  var students = (studentsDoc && studentsDoc.students) || [];
  var ids = {};
  dates.forEach(function (d) { Object.keys(days[d]).forEach(function (id) { ids[id] = true; }); });
  var known = students.filter(function (s) { return ids[s.id]; });
  var unknown = Object.keys(ids).filter(function (id) { return !students.some(function (s) { return s.id === id; }); });
  var rows = sortBy(known, function (s) { return String(s.name || '').toLowerCase(); }).map(function (s) { return { id: s.id, name: s.name }; });
  unknown.forEach(function (id) { rows.push({ id: id, name: id }); });
  var body = rows.map(function (r) {
    var p = 0, a = 0, l = 0;
    var marks = dates.map(function (d) {
      var m = days[d][r.id] || '';
      if (m === 'P') p++; else if (m === 'A') a++; else if (m === 'L') l++;
      return m;
    });
    return [r.name].concat(marks, [p, a, l]);
  });
  return table(['Student'].concat(dates, ['Present', 'Absent', 'Leave']), body);
}

function toBase64Url(text) {
  return Utilities.base64EncodeWebSafe(text, Utilities.Charset ? Utilities.Charset.UTF_8 : undefined).replace(/=+$/, '');
}

function setupLink(url, key) {
  return APP_URL + '#setup=' + toBase64Url(JSON.stringify({ r: url, t: key }));
}

// ------------------------------------------------------------------ storage (Drive folder + properties)

function props() {
  return PropertiesService.getScriptProperties();
}

function folder() {
  var id = props().getProperty('FOLDER_ID');
  if (!id) throw new Error('not_setup');
  return DriveApp.getFolderById(id);
}

function findFile(path) {
  var it = folder().getFilesByName(fileNameFor(path));
  return it.hasNext() ? it.next() : null;
}

function versionOf(path) {
  return props().getProperty('v:' + path) || '1';
}

function readJson(path) {
  var f = findFile(path);
  if (!f) return null;
  try { return JSON.parse(f.getBlob().getDataAsString()); } catch (e) { return null; }
}

function allFiles() {
  var out = {};
  var it = folder().getFiles();
  while (it.hasNext()) {
    var f = it.next();
    var path = pathForName(f.getName());
    if (path) out[path] = { content: f.getBlob().getDataAsString(), sha: versionOf(path) };
  }
  return out;
}

function hasExpectedShape(path, doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return false;
  if (path === 'students.json') return Array.isArray(doc.students);
  if (path === 'teachers.json') return Array.isArray(doc.teachers);
  if (path === 'meta.json') return typeof doc.nextReceiptNumber === 'number';
  if (path.indexOf('attendance/') === 0) return doc.days !== null && typeof doc.days === 'object' && !Array.isArray(doc.days);
  if (path.indexOf('payments/') === 0) return Array.isArray(doc.payments);
  return Array.isArray(doc.visits);
}

// ------------------------------------------------------------------ the readable Sheet

function spreadsheet() {
  var id = props().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : null;
}

function writeTab(ss, name, values) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  if (values.length && values[0].length) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.setFrozenRows(1);
  }
}

function docsInDir(dir) {
  var out = [];
  var files = allFiles();
  Object.keys(files).sort().forEach(function (p) {
    if (p.indexOf(dir + '/') === 0) { try { out.push({ path: p, doc: JSON.parse(files[p].content) }); } catch (e) { /* skip unreadable */ } }
  });
  return out;
}

function monthOfPath(path) {
  return path.replace(/^.*\//, '').replace(/\.json$/, '');
}

function staleList() {
  try { return JSON.parse(props().getProperty('STALE') || '[]'); } catch (e) { return []; }
}

/** Saving only notes which file changed; rebuilding the Sheet is slow, so refresh() does it later, once per tab. */
function markStale(path) {
  var list = staleList();
  if (list.indexOf(path) < 0) list.push(path);
  props().setProperty('STALE', JSON.stringify(list));
}

/** Students rebuilds every attendance tab, Teachers rebuilds Visits, and Payments or Visits read all months at once. */
function dedupeStale(paths) {
  var has = function (p) { return paths.indexOf(p) >= 0; };
  var seen = {};
  return paths.filter(function (p) {
    if (has('students.json') && p.indexOf('attendance/') === 0) return false;
    if (has('teachers.json') && p.indexOf('visits/') === 0) return false;
    var group = p.indexOf('payments/') === 0 ? 'payments' : p.indexOf('visits/') === 0 ? 'visits' : p;
    if (seen[group]) return false;
    seen[group] = true;
    return true;
  });
}

/** Rebuilds the Sheet tabs for every file saved since the last refresh. A tab that fails stays stale for next time. */
function refresh() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var paths;
  try {
    paths = dedupeStale(staleList());
    props().setProperty('STALE', '[]');
  } finally {
    lock.releaseLock();
  }
  var failed = paths.filter(function (p) { return !refreshViews(p); });
  if (failed.length) {
    lock.waitLock(20000);
    try { failed.forEach(markStale); } finally { lock.releaseLock(); }
  }
  return { ok: true, refreshed: paths.length - failed.length };
}

/** Rebuilds the tabs that depend on one file. Never throws: a view problem must not fail a save. Returns false on trouble. */
function refreshViews(path) {
  try {
    var ss = spreadsheet();
    if (!ss) return true;
    if (path === 'students.json') {
      var students = readJson('students.json');
      writeTab(ss, 'Students', studentsTable(students));
      docsInDir('attendance').forEach(function (d) { writeTab(ss, 'Attendance ' + monthOfPath(d.path), attendanceTable(d.doc, students)); });
    } else if (path === 'teachers.json') {
      var teachers = readJson('teachers.json');
      writeTab(ss, 'Teachers', teachersTable(teachers));
      writeTab(ss, 'Visits', visitsTable(docsInDir('visits').map(function (d) { return d.doc; }), teachers));
    } else if (path.indexOf('attendance/') === 0) {
      writeTab(ss, 'Attendance ' + monthOfPath(path), attendanceTable(readJson(path), readJson('students.json')));
    } else if (path.indexOf('payments/') === 0) {
      writeTab(ss, 'Payments', paymentsTable(docsInDir('payments').map(function (d) { return d.doc; })));
    } else if (path.indexOf('visits/') === 0) {
      writeTab(ss, 'Visits', visitsTable(docsInDir('visits').map(function (d) { return d.doc; }), readJson('teachers.json')));
    }
    return true;
  } catch (e) {
    Logger.log('view refresh failed for ' + path);
    return false;
  }
}

// ------------------------------------------------------------------ request handling

function fail(error, extra) {
  var out = { ok: false, error: error };
  if (extra) for (var k in extra) out[k] = extra[k];
  return out;
}

function handle(req) {
  req = req || {};
  var key = props().getProperty('KEY');
  if (!key) return fail('not_setup');
  if (typeof req.key !== 'string' || !safeEqual(req.key, key)) return fail('auth');

  try {
    switch (req.action) {
      case 'ping': {
        var ss = spreadsheet();
        return { ok: true, app: APP, protocol: PROTOCOL, sheetUrl: ss ? ss.getUrl() : '' };
      }
      case 'snapshot':
        return { ok: true, files: allFiles() };
      case 'read': {
        if (!isAllowedPath(req.path)) return fail('bad_request');
        var f = findFile(req.path);
        if (!f) return { ok: true, found: false };
        return { ok: true, found: true, content: f.getBlob().getDataAsString(), sha: versionOf(req.path) };
      }
      case 'list': {
        if (DIRS.indexOf(req.dir) < 0) return fail('bad_request');
        var paths = Object.keys(allFiles()).filter(function (p) { return p.indexOf(req.dir + '/') === 0; }).sort();
        return { ok: true, paths: paths };
      }
      case 'write':
        return write(req);
      case 'refresh':
        return refresh();
      default:
        return fail('bad_request');
    }
  } catch (e) {
    return fail('server_error');
  }
}

function write(req) {
  if (!isAllowedPath(req.path)) return fail('bad_request');
  if (typeof req.content !== 'string') return fail('bad_request');
  if (req.content.length > MAX_CHARS) return fail('too_large');
  var doc;
  try { doc = JSON.parse(req.content); } catch (e) { return fail('bad_request'); }
  if (!hasExpectedShape(req.path, doc)) return fail('bad_request');

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  var newVersion;
  try {
    var existing = findFile(req.path);
    var expected = req.sha === undefined || req.sha === null ? '' : String(req.sha);
    if (existing) {
      if (expected !== versionOf(req.path)) return fail('conflict');
      existing.setContent(req.content);
      newVersion = String(Number(versionOf(req.path)) + 1);
    } else {
      if (expected !== '') return fail('conflict');
      folder().createFile(fileNameFor(req.path), req.content, 'application/json');
      newVersion = '1';
    }
    props().setProperty('v:' + req.path, newVersion);
    if (req.path !== 'meta.json') markStale(req.path); // the Sheet is rebuilt later by refresh(), so a save stays quick
  } finally {
    lock.releaseLock();
  }
  return { ok: true, sha: newVersion };
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** POST body is JSON sent as plain text (no browser pre-flight). */
function doPost(e) {
  var req;
  try { req = JSON.parse(e && e.postData && e.postData.contents); } catch (err) { return respond(fail('bad_request')); }
  return respond(handle(req));
}

/** A key-free health check only. It never returns data. */
function doGet() {
  rememberExecUrl();
  return respond({ ok: true, app: APP, protocol: PROTOCOL });
}

/**
 * Run from the editor, Google reports the owner-only test address (.../dev). Only a live request knows the real
 * address (.../exec), so the first live request records it for showConnection.
 */
function rememberExecUrl() {
  try {
    var url = ScriptApp.getService().getUrl();
    if (/\/exec$/.test(url) && props().getProperty('EXEC_URL') !== url) props().setProperty('EXEC_URL', url);
  } catch (e) { /* the address is only a convenience */ }
}

function execUrl() {
  var stored = props().getProperty('EXEC_URL');
  if (stored) return stored;
  try {
    var url = ScriptApp.getService().getUrl();
    return /\/exec$/.test(url) ? url : '';
  } catch (e) { return ''; }
}

// ------------------------------------------------------------------ one-time setup (run by the owner)

function newKey() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
}

/** Creates the Drive folder, the readable Sheet and the secret key. Safe to run again: nothing is replaced. */
function setup() {
  var p = props();
  if (!p.getProperty('FOLDER_ID')) {
    var f = DriveApp.createFolder(FOLDER_NAME);
    p.setProperty('FOLDER_ID', f.getId());
  }
  if (!p.getProperty('SHEET_ID')) {
    var ss = SpreadsheetApp.create(SHEET_NAME);
    p.setProperty('SHEET_ID', ss.getId());
    try { DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(p.getProperty('FOLDER_ID'))); } catch (e) { /* stays in My Drive */ }
  }
  if (!p.getProperty('KEY')) p.setProperty('KEY', newKey());
  showConnection();
  return 'Setup done. Open the Sheet and read the Connection tab.';
}

/** Writes the address, the key and the ready-made setup link into the Connection tab of the Sheet (owner only). */
function showConnection() {
  var ss = spreadsheet();
  if (!ss) throw new Error('not_setup');
  var url = execUrl();
  var key = props().getProperty('KEY');
  var rows = [
    ['Keep this tab private. Anyone with the address and key can read and change the tuition data.', ''],
    ['Web app address', url || 'Not known yet: deploy as a Web app, open the web app address once in a browser, then run showConnection again'],
    ['Secret key', key],
    ['Setup link for a phone', url ? setupLink(url, key) : 'Appears once the web app is deployed'],
  ];
  writeTab(ss, 'Connection', rows.map(function (r) { return r.map(safeCell); }));
  return rows;
}

/** Replaces the secret key. Every phone must then be set up again with the new setup link. */
function rotateKey() {
  props().setProperty('KEY', newKey());
  showConnection();
  return 'The key was replaced. Open the Connection tab for the new setup link.';
}

if (typeof module !== 'undefined') {
  module.exports = { handle: handle, doPost: doPost, doGet: doGet, setup: setup, showConnection: showConnection, rotateKey: rotateKey,
    safeEqual: safeEqual, safeCell: safeCell, isAllowedPath: isAllowedPath, studentsTable: studentsTable, teachersTable: teachersTable,
    paymentsTable: paymentsTable, visitsTable: visitsTable, attendanceTable: attendanceTable };
}
