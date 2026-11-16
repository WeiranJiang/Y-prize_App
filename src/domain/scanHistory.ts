import type { Scan } from './types';

export interface ScanSession { key: string; at: string; scans: Scan[] }
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The case reads both arches together; records within one minute form a session. */
export function scanSessions(scans: Scan[], now = new Date()): ScanSession[] {
  const groups = new Map<string, ScanSession>();
  for (const scan of new Map(scans.map(scan => [scan.id, scan])).values()) {
    const time = Date.parse(scan.at);
    if (!Number.isFinite(time) || time > now.getTime()) continue;
    const key = String(Math.floor(time / 60000));
    const group = groups.get(key);
    if (group) {
      group.scans.push(scan);
      if (time > Date.parse(group.at)) group.at = scan.at;
    } else groups.set(key, { key, at: scan.at, scans: [scan] });
  }
  return [...groups.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function sessionsByDay(sessions: ScanSession[]): Map<string, ScanSession[]> {
  const days = new Map<string, ScanSession[]>();
  for (const session of sessions) {
    const key = dayKey(new Date(session.at));
    days.set(key, [...(days.get(key) ?? []), session]);
  }
  return days;
}

/** Local calendar dates use noon and calendar arithmetic to stay stable across DST. */
export function calendarDays(year: number, month?: number): (Date | null)[] {
  const start = new Date(year, month ?? 0, 1, 12);
  const end = month == null ? new Date(year, 11, 31, 12) : new Date(year, month + 1, 0, 12);
  const cells: (Date | null)[] = Array.from({ length: start.getDay() }, () => null);
  const cursor = new Date(start);
  while (cursor <= end) {
    cells.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}
