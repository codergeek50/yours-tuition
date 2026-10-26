/**
 * Conflict resolution when the data repo changed since this device last synced.
 * Nothing is dropped: both sides are combined with simple, predictable rules.
 */

type Json = any;

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function byId<T extends { id: string }>(remote: T[], local: T[], pick: (r: T, l: T) => T): T[] {
  const map = new Map<string, T>(remote.map((r) => [r.id, r]));
  for (const l of local) {
    const r = map.get(l.id);
    map.set(l.id, r ? pick(r, l) : l);
  }
  return [...map.values()];
}

export function mergeFile(path: string, remoteText: string, localText: string): string {
  const remote: Json = JSON.parse(remoteText);
  const local: Json = JSON.parse(localText);

  if (path === 'students.json') {
    const students = byId(remote.students ?? [], local.students ?? [], (r: Json, l: Json) => ((l.updatedAt ?? '') >= (r.updatedAt ?? '') ? l : r));
    return JSON.stringify({ ...remote, ...local, students }, null, 2);
  }
  if (path === 'teachers.json') {
    const teachers = byId(remote.teachers ?? [], local.teachers ?? [], (r: Json, l: Json) => ((l.updatedAt ?? '') >= (r.updatedAt ?? '') ? l : r));
    return JSON.stringify({ ...remote, ...local, teachers }, null, 2);
  }
  if (path.startsWith('visits/')) {
    // A deleted visit always stays deleted; otherwise the newer edit wins.
    const visits = byId(remote.visits ?? [], local.visits ?? [], (r: Json, l: Json) => (r.deleted ? r : l.deleted ? l : (l.updatedAt ?? '') >= (r.updatedAt ?? '') ? l : r));
    return JSON.stringify({ ...remote, ...local, visits }, null, 2);
  }
  if (path.startsWith('expenses/')) {
    // Same rule as visits: a deleted expense stays deleted; otherwise the newer edit wins.
    const expenses = byId(remote.expenses ?? [], local.expenses ?? [], (r: Json, l: Json) => (r.deleted ? r : l.deleted ? l : (l.updatedAt ?? '') >= (r.updatedAt ?? '') ? l : r));
    return JSON.stringify({ ...remote, ...local, expenses }, null, 2);
  }
  if (path.startsWith('attendance/')) {
    const days: Record<string, Record<string, string>> = { ...(remote.days ?? {}) };
    for (const [date, marks] of Object.entries<Record<string, string>>(local.days ?? {})) {
      if (UNSAFE_KEYS.has(date)) continue;
      days[date] = { ...(days[date] ?? {}), ...marks };
    }
    for (const k of UNSAFE_KEYS) delete days[k];
    const merged: Json = { ...remote, ...local, days };
    if (remote.holidays || local.holidays) {
      // Both sides' holidays are kept; this device wins for the same date (an empty name is a removal).
      const holidays: Record<string, string> = {};
      for (const side of [remote.holidays ?? {}, local.holidays ?? {}]) {
        for (const [date, name] of Object.entries<string>(side)) if (!UNSAFE_KEYS.has(date)) holidays[date] = name;
      }
      merged.holidays = holidays;
    }
    return JSON.stringify(merged, null, 2);
  }
  if (path.startsWith('payments/')) {
    const payments = byId(remote.payments ?? [], local.payments ?? [], (r: Json, l: Json) => (r.receipt?.voided ? r : l.receipt?.voided ? l : l));
    return JSON.stringify({ ...remote, ...local, payments }, null, 2);
  }
  if (path === 'meta.json') {
    return JSON.stringify({ ...remote, ...local, nextReceiptNumber: Math.max(remote.nextReceiptNumber ?? 1, local.nextReceiptNumber ?? 1) }, null, 2);
  }
  // Unknown file: keep this device's version.
  return localText;
}
