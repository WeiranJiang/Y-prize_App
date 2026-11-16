import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, ScrollViewInstance, View } from 'react-native';
import { scanTimeLabel } from '../domain/dates';
import { calendarDays, dayKey, scanSessions, sessionsByDay } from '../domain/scanHistory';
import { useStore } from '../state/store';
import { colors, space } from '../theme/tokens';
import { Card, Divider, IconButton, Meta, Section, Segmented, T } from './ui';

const LEVELS = [colors.surfaceRaised, '#254C3B', '#397858', '#55AA7B'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const countText = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

export default function ScanHistory() {
  const { state, stripById } = useStore();
  const yearScroll = useRef<ScrollViewInstance>(null);
  const today = new Date();
  const [mode, setMode] = useState<'month' | 'year'>('year');
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
  const heading = mode === 'year' ? String(year) : period.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const canNext = mode === 'year' ? year < today.getFullYear() : year < today.getFullYear() || year === today.getFullYear() && month < today.getMonth();
  const move = (direction: number) => {
    setPeriod(new Date(year + (mode === 'year' ? direction : 0), month + (mode === 'month' ? direction : 0), 1, 12));
    setSelected(null);
  };
  const cell = (date: Date | null) => {
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
          width: 11, height: 11,
          borderRadius: 2,
          backgroundColor: date && !future ? LEVELS[Math.min(count, 3)] : 'transparent',
          borderWidth: on ? 2 : 1,
          borderColor: on ? colors.text : date && key === dayKey(today) ? colors.textSecondary : 'transparent',
          opacity: future ? 0.3 : 1,
        }} />
    );
  };

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
          {!((mode === 'year' && year === today.getFullYear()) || (mode === 'month' && year === today.getFullYear() && month === today.getMonth())) ? <Pressable accessibilityRole="button" onPress={() => { setPeriod(new Date(today.getFullYear(), today.getMonth(), 1, 12)); setSelected(null); }} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><T v="small" style={{ color: colors.text }}>Back to today</T></Pressable> : null}
          <Meta style={{ marginBottom: space.md }}>{countText(periodSessions.length)} · {activeDays} active day{activeDays === 1 ? '' : 's'}</Meta>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ paddingTop: 24, gap: 3 }}>
              {WEEKDAYS.map((day, index) => <View key={day} style={{ height: 11, justifyContent: 'center' }}><T v="small" style={{ fontSize: 9 }}>{index % 2 === 1 ? day : ''}</T></View>)}
            </View>
            <ScrollView style={{ flex: 1 }} key={`${mode}-${year}-${month}`} ref={yearScroll} horizontal onContentSizeChange={() => yearScroll.current?.scrollToEnd({ animated: false })} showsHorizontalScrollIndicator contentContainerStyle={{ gap: 3, paddingBottom: space.sm }}>
              {Array.from({ length: cells.length / 7 }, (_, week) => {
                const days = cells.slice(week * 7, week * 7 + 7);
                const monthStart = days.find(date => date?.getDate() === 1);
                return <View key={week} style={{ gap: 3 }}>
                  <View style={{ height: 20, overflow: 'visible' }}>
                    {mode === 'year' && monthStart ? <T v="small" style={{ position: 'absolute', width: 32, fontSize: 10 }}>{monthStart.toLocaleDateString(undefined, { month: 'short' })}</T> : null}
                  </View>
                  {days.map((date, index) => <React.Fragment key={index}>{cell(date)}</React.Fragment>)}
                </View>;
              })}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm, marginTop: space.md }}>
            {LEVELS.map((color, index) => <View key={color} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: color }} /><Meta>{index === 3 ? '3+' : index}</Meta></View>)}
            <Meta>sessions / day</Meta>
          </View>
          {selected ? <Meta style={{ marginTop: space.sm }}>{ `${new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} · ${countText(byDay.get(selected)?.length ?? 0)}`}</Meta> : null}
        </Card>
      </Section>
    </>
  );
}
