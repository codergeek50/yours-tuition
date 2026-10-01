/**
 * Conflict resolution when the data repo changed since this device last synced.
 * Nothing is dropped: both sides are combined with simple, predictable rules.
 */

type Json = any;

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
  if (path.startsWith('attendance/')) {
    const days: Record<string, Record<string, string>> = { ...(remote.days ?? {}) };
    for (const [date, marks] of Object.entries<Record<string, string>>(local.days ?? {})) {
      days[date] = { ...(days[date] ?? {}), ...marks };
    }
    return JSON.stringify({ ...remote, ...local, days }, null, 2);
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
