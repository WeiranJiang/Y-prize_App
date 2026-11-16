import ScanHistory from '../../components/ScanHistory';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Card, Screen, Section, T } from '../../components/ui';
import { BIOMARKERS } from '../../domain/biomarkers';
import { buildOverview, Direction } from '../../domain/overview';
import { useStore } from '../../state/store';
import { colors, space } from '../../theme/tokens';

const DIR: Record<Direction, { arrow: string; word: string }> = {
  improving: { arrow: '↑', word: 'Improving' },
  steady: { arrow: '→', word: 'Steady' },
  worsening: { arrow: '↓', word: 'Needs attention' },
};
const pctTxt = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);

/** Tiny line of in-range share over sessions (0–100%). */
function Mini({ points, color, w = 120, h = 30 }: { points: (number | null)[]; color: string; w?: number; h?: number }) {
  const v = points.map((p, i) => ({ p, i })).filter((x): x is { p: number; i: number } => x.p != null);
  if (v.length < 2) return <View style={{ width: w, height: h }} />;
  const lo = Math.min(...v.map((x) => x.p), 0.5);
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * (w - 6) + 3;
  const y = (p: number) => 3 + (1 - (p - lo) / (1 - lo || 1)) * (h - 6);
  const d = v.map((pt, k) => `${k ? 'L' : 'M'}${x(pt.i).toFixed(1)},${y(pt.p).toFixed(1)}`).join('');
  const last = v[v.length - 1];
  return (
    <Svg width={w} height={h}>
      <Path d={d} stroke={colors.textSecondary} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
      <Circle cx={x(last.i)} cy={y(last.p)} r={3.5} fill={color} stroke={colors.bg2} strokeWidth={2} />
    </Svg>
  );
}

export default function Overview() {
  const { state } = useStore();
  const o = useMemo(() => buildOverview(state.scans, state.strips, 30), [state.scans, state.strips, state.rev]);
  const watch = o.biomarkers.filter((b) => b.concerns > 0 || b.direction === 'worsening');

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T v="display">Overview</T></View>
      </View>
      <ScanHistory />

      {watch.length ? <Section title="Worth a closer look"><T v="body">{watch.map(b => BIOMARKERS[b.id].shortName).join(', ')} {watch.length === 1 ? 'has' : 'have'} flagged readings or a worsening trend.</T></Section> : null}
      {/* Biomarkers */}
      <Section title="Measurements">
        <T v="body" style={{ marginBottom: space.md }}>Past 30 days</T>
        <View style={styles.grid}>
          {o.biomarkers.map((b) => {
            const bm = BIOMARKERS[b.id];
            return (
              <Pressable key={b.id} style={styles.tileWrap} onPress={() => router.push({ pathname: '/biomarker', params: { id: b.id } })}>
                <Card style={styles.tile}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T v="small" style={{ color: colors.text }}>{bm.shortName}</T>
                  </View>
                  <T v="number" style={{ fontSize: 28, marginTop: 8 }}>{pctTxt(b.inRange)}</T>
                  <T v="small" style={{ fontSize: 12 }}>
                    {DIR[b.direction].arrow} {DIR[b.direction].word}
                  </T>
                  <View style={{ marginTop: 8 }}>
                    <Mini points={b.history} color={b.concerns ? colors.high : colors.point} w={96} />
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      </Section>

    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  tileWrap: { width: '50%', padding: 5 },
  tile: { padding: 14 },
});
