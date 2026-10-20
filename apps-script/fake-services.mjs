// An in-memory stand-in for the parts of Google Apps Script that Code.gs uses (Drive, Sheets, properties, locks).
// Used by the tests and by the local end-to-end server, so the real Code.gs runs unchanged without Google.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createFakeApps({ deployedUrl = 'https://script.google.com/macros/s/FAKEDEPLOYMENTID/exec' } = {}) {
  const state = {
    files: new Map(), // id -> { id, name, content, parentId }
    folders: new Map(), // id -> { id, name }
    spreadsheets: new Map(), // id -> { id, name, tabs: Map(name -> { values }) }
    props: new Map(),
    lock: { held: 0, acquired: 0 },
    failSheets: false,
    logs: [],
    deployedUrl,
    seq: 0,
  };
  const id = (prefix) => `${prefix}${++state.seq}`;
  const iterator = (items) => {
    let i = 0;
    return { hasNext: () => i < items.length, next: () => items[i++] };
  };

  const fileApi = (rec) => ({
    getId: () => rec.id,
    getName: () => rec.name,
    getBlob: () => ({ getDataAsString: () => rec.content }),
    setContent: (s) => { rec.content = s; return fileApi(rec); },
    moveTo: (folder) => { rec.parentId = folder.getId(); return fileApi(rec); },
  });
  const folderApi = (f) => ({
    getId: () => f.id,
    getFiles: () => iterator([...state.files.values()].filter((r) => r.parentId === f.id).map(fileApi)),
    getFilesByName: (name) => iterator([...state.files.values()].filter((r) => r.parentId === f.id && r.name === name).map(fileApi)),
    createFile: (name, content) => {
      const rec = { id: id('file'), name, content, parentId: f.id };
      state.files.set(rec.id, rec);
      return fileApi(rec);
    },
  });

  const sheetApi = (ss, tab) => ({
    clear: () => { state.sheetWrites = (state.sheetWrites ?? 0) + 1; tab.values = []; },
    getRange: () => ({ setValues: (v) => { tab.values = v; } }),
    setFrozenRows: () => {},
  });
  const ssApi = (ss) => ({
    getId: () => ss.id,
    getUrl: () => `https://docs.google.com/spreadsheets/d/${ss.id}/edit`,
    getSheetByName: (name) => (ss.tabs.has(name) ? sheetApi(ss, ss.tabs.get(name)) : null),
    insertSheet: (name) => {
      if (state.failSheets) throw new Error('Sheets unavailable');
      const tab = { values: [] };
      ss.tabs.set(name, tab);
      return sheetApi(ss, tab);
    },
  });

  const globals = {
    DriveApp: {
      createFolder: (name) => {
        const f = { id: id('folder'), name };
        state.folders.set(f.id, f);
        return folderApi(f);
      },
      getFolderById: (i) => folderApi(state.folders.get(i)),
      getFileById: (i) => fileApi(state.files.get(i)),
    },
    SpreadsheetApp: {
      create: (name) => {
        const ss = { id: id('sheet'), name, tabs: new Map() };
        state.spreadsheets.set(ss.id, ss);
        state.files.set(ss.id, { id: ss.id, name, content: '', parentId: null });
        return ssApi(ss);
      },
      openById: (i) => ssApi(state.spreadsheets.get(i)),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (state.props.has(k) ? state.props.get(k) : null),
        setProperty: (k, v) => { state.props.set(k, String(v)); },
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { state.lock.held += 1; state.lock.acquired += 1; },
        releaseLock: () => { state.lock.held -= 1; },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent: () => text }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      getUuid: () => randomUUID(),
      base64EncodeWebSafe: (s) => Buffer.from(String(s), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    },
    ScriptApp: { getService: () => ({ getUrl: () => state.deployedUrl }) },
    Logger: { log: (m) => { state.logs.push(String(m)); } },
  };

  return { state, globals };
}

/** Runs the real Code.gs against the fake services and returns its exported functions. */
export function loadServer(apps = createFakeApps()) {
  const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'Code.gs'), 'utf8');
  const names = Object.keys(apps.globals);
  const fn = new Function(...names, 'module', `${code}\nreturn module.exports;`);
  const mod = { exports: {} };
  const exported = fn(...names.map((n) => apps.globals[n]), mod);
  return { server: exported, apps };
}

/** Reads a tab's values back, for assertions. */
export function tabValues(apps, name) {
  for (const ss of apps.state.spreadsheets.values()) if (ss.tabs.has(name)) return ss.tabs.get(name).values;
  return undefined;
}
