import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, View } from 'react-native';
import { scanTimeLabel } from '../domain/dates';
import { calendarDays, dayKey, scanSessions, sessionsByDay } from '../domain/scanHistory';
import { useStore } from '../state/store';
import { colors, space } from '../theme/tokens';
import Disclosure from './Disclosure';
import { Card, Divider, IconButton, Meta, Section, Segmented, T } from './ui';

const LEVELS = [colors.surfaceRaised, '#254C3B', '#397858', '#55AA7B'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const countText = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

export default function ScanHistory() {
  const { state, stripById } = useStore();
  const yearScroll = useRef<ScrollViewInstance>(null);
  const today = new Date();
  const [mode, setMode] = useState<'month' | 'year'>('month');
  const [period, setPeriod] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1, 12));
  const [selected, setSelected] = useState<string | null>(null);
  const sessions = useMemo(() => scanSessions(state.scans), [state.scans]);
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const year = period.getFullYear();
  const month = period.getMonth();
  const cells = calendarDays(year, mode === 'month' ? month : undefined);
  const periodSessions = sessions.filter(session => {
    const date = new Date(session.at);
    return date.getFullYear() === year && (mode === 'year' || date.getMonth() === month);
  });
  const activeDays = new Set(periodSessions.map(session => dayKey(new Date(session.at)))).size;
  const shownSessions = selected ? byDay.get(selected) ?? [] : periodSessions;
  const heading = mode === 'year' ? String(year) : period.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const canNext = mode === 'year' ? year < today.getFullYear() : year < today.getFullYear() || year === today.getFullYear() && month < today.getMonth();
  const move = (direction: number) => {
    setPeriod(new Date(year + (mode === 'year' ? direction : 0), month + (mode === 'month' ? direction : 0), 1, 12));
    setSelected(null);
  };
  const cell = (date: Date | null, compact = false) => {
    const key = date ? dayKey(date) : '';
    const count = byDay.get(key)?.length ?? 0;
    const future = !!date && key > dayKey(today);
    const on = key === selected;
    return (
      <Pressable
        disabled={!date || future}
        accessibilityRole="button"
        accessibilityLabel={date ? `${date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}: ${future ? 'future date' : countText(count)}` : undefined}
        accessibilityState={{ selected: on, disabled: !date || future }}
        onPress={() => setSelected(value => value === key ? null : key)}
        style={{
          ...(compact ? { width: 13, height: 13 } : { width: '13.2%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }),
          borderRadius: compact ? 3 : 7,
          backgroundColor: date && !future ? LEVELS[Math.min(count, 3)] : 'transparent',
          borderWidth: on ? 2 : 1,
          borderColor: on ? colors.text : date && key === dayKey(today) ? colors.textSecondary : 'transparent',
          opacity: future ? 0.3 : 1,
        }}>
        {!compact && date ? <T v="small" style={{ color: count ? '#FFFFFF' : colors.textSecondary, fontSize: 12 }}>{date.getDate()}</T> : null}
      </Pressable>
    );
  };

  const sessionRows = (list: typeof sessions) => list.map(session => (
    <View key={session.key} style={{ paddingVertical: space.md, gap: space.sm }}>
      <T v="bodyStrong" style={{ fontSize: 14 }}>{scanTimeLabel(session.at)}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {session.scans.map(scan => {
          const arch = stripById(scan.stripId)?.arch;
          return <Pressable key={scan.id} accessibilityRole="button" accessibilityLabel={`View ${arch ?? 'strip'} scan details from ${scanTimeLabel(scan.at)}`} onPress={() => router.push({ pathname: '/scan-details', params: { id: scan.id } })} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }}><T v="small" style={{ color: colors.text }}>{arch === 'upper' ? 'Upper' : arch === 'lower' ? 'Lower' : 'Strip'} details ›</T></Pressable>;
        })}
      </View>
      <Divider />
    </View>
  ));

  return (
    <>
      <Section title="Last recorded scans">
        <Card>
          {(['upper', 'lower'] as const).map((arch, index) => {
            const scan = sessions.flatMap(session => session.scans).find(record => stripById(record.stripId)?.arch === arch);
            return <View key={arch}>
              {index ? <Divider style={{ marginVertical: space.md }} /> : null}
              <T v="small">{arch === 'upper' ? 'Upper' : 'Lower'} retainer</T>
              {scan ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/scan-details', params: { id: scan.id } })} style={{ minHeight: 44, justifyContent: 'center' }}><T v="bodyStrong" style={{ marginTop: 4, fontSize: 15 }}>{scanTimeLabel(scan.at)} ›</T></Pressable> : <T v="body">No scans recorded yet</T>}
            </View>;
          })}
          <Meta style={{ marginTop: space.md }}>Automatic case readouts appear here after syncing. This demo shows simulated history.</Meta>
        </Card>
      </Section>
      <Section title="Scan history">
        <Card>
          <Segmented fill style={{ paddingHorizontal: 0 }} options={[{ key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }]} value={mode} onChange={value => { setMode(value); setSelected(null); }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: space.md }}>
            <IconButton name="chevronLeft" label={`Previous ${mode}`} onPress={() => move(-1)} />
            <T v="bodyStrong">{heading}</T>
            <View style={{ opacity: canNext ? 1 : 0.25 }} pointerEvents={canNext ? 'auto' : 'none'} accessibilityElementsHidden={!canNext}>
              <IconButton name="chevron" label={`Next ${mode}`} onPress={() => canNext && move(1)} />
            </View>
          </View>
          <Pressable accessibilityRole="button" onPress={() => { setPeriod(new Date(today.getFullYear(), today.getMonth(), 1, 12)); setSelected(null); }} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><T v="small" style={{ color: colors.text }}>Back to today</T></Pressable>
          <Meta style={{ marginBottom: space.md }}>{countText(periodSessions.length)} · {activeDays} active day{activeDays === 1 ? '' : 's'}</Meta>
          {mode === 'month' ? (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.sm }}>{WEEKDAYS.map(day => <T key={day} v="small" style={{ width: '13.2%', textAlign: 'center', fontSize: 11 }}>{day}</T>)}</View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 5 }}>{cells.map((date, index) => <React.Fragment key={index}>{cell(date)}</React.Fragment>)}</View>
            </>
          ) : (
            <>
              <Meta style={{ marginBottom: space.sm }}>Swipe across the calendar · tap a day for details</Meta>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
              <View style={{ paddingTop: 24, gap: 4 }}>{WEEKDAYS.map((day, index) => <View key={day} style={{ height: 13, justifyContent: 'center' }}><T v="small" style={{ fontSize: 9 }}>{index % 2 === 1 ? day : ''}</T></View>)}</View>
              <ScrollView style={{ flex: 1 }} key={year} ref={yearScroll} horizontal onContentSizeChange={() => yearScroll.current?.scrollToEnd({ animated: false })} showsHorizontalScrollIndicator contentContainerStyle={{ gap: 4, paddingBottom: space.sm }}>
                {Array.from({ length: cells.length / 7 }, (_, week) => {
                  const days = cells.slice(week * 7, week * 7 + 7);
                  const monthStart = days.find(date => date?.getDate() === 1);
                  return <View key={week} style={{ gap: 4 }}>
                    <View style={{ height: 20, overflow: 'visible' }}>{monthStart ? <T v="small" style={{ position: 'absolute', width: 35, fontSize: 10 }}>{monthStart.toLocaleDateString(undefined, { month: 'short' })}</T> : null}</View>
                    {days.map((date, index) => <React.Fragment key={index}>{cell(date, true)}</React.Fragment>)}
                  </View>;
                })}
              </ScrollView>
              </View>
            </>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
            {LEVELS.map((color, index) => <View key={color} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: color }} /><Meta>{index === 3 ? '3+' : index}</Meta></View>)}
            <Meta>sessions / day</Meta>
          </View>
          {mode === 'month' ? <Meta style={{ marginTop: space.sm }}>Tap a day to see its recorded sessions.</Meta> : null}
          <Meta style={{ marginTop: space.sm }}>Activity, not tooth health. Paired upper/lower readings count as one session.</Meta>
          <Divider style={{ marginTop: space.lg }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.md }}>
            <T v="bodyStrong">{selected ? new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent sessions'}</T>
            {selected ? <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={{ minHeight: 44, justifyContent: 'center' }}><T v="small">Clear day</T></Pressable> : null}
          </View>
          {!shownSessions.length ? <T v="small" style={{ marginTop: space.md }}>{selected ? 'No scans recorded on this day.' : 'No scans recorded in this period.'}</T> : sessionRows(shownSessions.slice(0, 3))}
          {shownSessions.length > 3 ? <Disclosure title={`Show ${shownSessions.length - 3} more sessions`}>{sessionRows(shownSessions.slice(3))}</Disclosure> : null}
        </Card>
      </Section>
    </>
  );
}
