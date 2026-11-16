import ScanHistory from '../../components/ScanHistory';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Card, DemoBadge, Screen, Section, Segmented, T } from '../../components/ui';
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

function Ring({ value, size = 168 }: { value: number; size?: number }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairlineStrong} strokeWidth={6} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.point}
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - value)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

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
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const o = useMemo(() => buildOverview(state.scans, state.strips, Number(range)), [state.scans, state.strips, range, state.rev]);
  const watch = o.biomarkers.filter((b) => b.concerns > 0 || b.direction === 'worsening');

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T v="display">Overview</T><DemoBadge /></View>
        <T v="small" style={{ marginTop: 2 }}>How your measured readings are changing</T>
      </View>
      <View style={{ marginTop: space.lg }}>
        <Segmented fill options={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }]} value={range} onChange={setRange} />
      </View>

      {/* Overall */}
      <View style={{ alignItems: 'center', marginTop: space.xxl }}>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ring value={o.overall ?? 0} />
          <View style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <T v="number" style={{ fontSize: 44 }}>{pctTxt(o.overall)}</T>
              <T v="small" style={{ fontSize: 12 }}>readings in range</T>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: space.xxl, marginTop: space.xl }}>
          {(['upper', 'lower'] as const).map((a) => (
            <View key={a} style={{ alignItems: 'center' }}>
              <T v="number" style={{ fontSize: 24 }}>{pctTxt(o.byArch[a])}</T>
              <T v="small" style={{ fontSize: 12 }}>{a === 'upper' ? 'Upper teeth' : 'Lower teeth'}</T>
            </View>
          ))}
        </View>
        <T v="bodyStrong" style={{ marginTop: space.lg }}>{o.overall == null ? 'No readings yet' : `${DIR[o.direction].arrow} ${DIR[o.direction].word}`}</T>
        <T v="small" style={{ marginTop: space.sm, paddingHorizontal: space.lg, textAlign: 'center' }}>Based on measured sites, not a score of overall dental health.</T>
      </View>

      <ScanHistory />

      {watch.length ? <Section title="Worth a closer look"><T v="body">{watch.map(b => BIOMARKERS[b.id].shortName).join(', ')} {watch.length === 1 ? 'has' : 'have'} flagged readings or a worsening trend. Open a measurement below to see where.</T></Section> : null}
      {/* Biomarkers */}
      <Section title="Measurements">
        <T v="small" style={{ marginBottom: space.md }}>Each percentage shows readings in range. Tap for details and locations.</T>
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
