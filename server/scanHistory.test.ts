import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDays, dayKey, scanSessions, sessionsByDay } from '../src/domain/scanHistory.js';
import type { Scan } from '../src/domain/types.js';
const record = (id: string, at: string) => ({ id, at } as Scan);

test('paired readouts count once; duplicates, invalid dates and future records do not inflate activity', () => {
  const rows = scanSessions([
    record('upper', '2026-03-08T16:00:00Z'),
    record('lower', '2026-03-08T16:00:02Z'),
    record('upper', '2026-03-08T16:00:00Z'),
    record('later', '2026-03-08T17:00:00Z'),
    record('invalid', 'not-a-date'),
    record('future', '2027-01-01T00:00:00Z'),
  ], new Date('2026-03-09T00:00:00Z'));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].scans[0].id, 'later');
  assert.equal(rows[1].scans.length, 2);
  assert.equal([...sessionsByDay(rows).values()][0].length, 2);
});

test('activity follows local midnight rather than the UTC date', () => {
  const before = new Date(2026, 2, 8, 23, 59);
  const after = new Date(2026, 2, 9, 0, 1);
  const rows = scanSessions([record('a', before.toISOString()), record('b', after.toISOString())], new Date(2026, 2, 10));
  const days = sessionsByDay(rows);
  assert.equal(days.get('2026-03-08')?.length, 1);
  assert.equal(days.get('2026-03-09')?.length, 1);
});

test('month/year grids align weekdays and include leap days without DST gaps', () => {
  const month = calendarDays(2026, 2);
  const dates = month.filter((date): date is Date => date !== null);
  assert.equal(month.length % 7, 0);
  assert.equal(dates.length, 31);
  assert.deepEqual(dates.map(date => date.getDate()), Array.from({ length: 31 }, (_, i) => i + 1));
  dates.forEach(date => assert.equal(month.indexOf(date) % 7, date.getDay()));
  const year = calendarDays(2024).filter((date): date is Date => date !== null);
  assert.equal(year.length, 366);
  assert.ok(year.some(date => dayKey(date) === '2024-02-29'));
  assert.equal(scanSessions([]).length, 0);
});
