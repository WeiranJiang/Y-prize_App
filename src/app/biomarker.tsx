/**
 * Biomarker detail: current summary, history with reference range and
 * touch-to-inspect, and every monitored location.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { statLine } from '../components/BiomarkerCard';
import LineChart, { LPoint } from '../components/charts/LineChart';
import Sparkline from '../components/charts/Sparkline';
import { DemoBadge, IconButton, Meta, Screen, Section, Segmented, StatusDot, StatusTag, T } from '../components/ui';
import { siteSeries, siteTitle } from '../domain/analysis';
import { BIOMARKERS, BiomarkerId, classify, formatValue, STATUS_RANK, unitSuffix } from '../domain/biomarkers';
import { biomarkerStat } from '../domain/overview';
import type { Arch } from '../domain/teeth';
import { useStore } from '../state/store';
import { STATUS_HEX } from '../three/regions';
import { colors, radius, space } from '../theme/tokens';
import { scanTimeLabel } from '../domain/dates';

type Range = '1' | '7' | '30' | '90';
const RANGES: { key: Range; label: string }[] = [
  { key: '1', label: '1D' },
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
];

function niceTicks(lo: number, hi: number, n = 4) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export default function BiomarkerDetail() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bio: BiomarkerId = typeof id === 'string' && Object.prototype.hasOwnProperty.call(BIOMARKERS, id) ? (id as BiomarkerId) : 'pH';
  const b = BIOMARKERS[bio];
  const { state } = useStore();
  const [range, setRange] = useState<Range>('30');
  const [where, setWhere] = useState<'both' | Arch>('both');
  const numbering = state.settings.numbering;
  const days = Number(range);

  const stat = useMemo(() => biomarkerStat(bio, state.scans, state.strips, days, where === 'both' ? undefined : where), [bio, state.scans, state.strips, days, where, state.rev]);
  const fmt = (v: number) => formatValue(b, v);

  // When the window holds a single session (1D), widen the chart's x-range slightly so the point is visible.
  const pts: LPoint[] = stat.series.map((p) => ({ x: +new Date(p.at), y: p.value }));
  const xs = pts.map((p) => p.x);
  const x0 = xs.length ? Math.min(...xs) : Date.now() - days * 86400000;
  const x1 = xs.length ? Math.max(...xs) : Date.now();
  const xDomain: [number, number] = x1 - x0 < 3600000 ? [x0 - 6 * 3600000, x1 + 6 * 3600000] : [x0, x1];

  const current = state.strips.filter((s) => !s.retiredAt && (where === 'both' || s.arch === where));
  const sites = current
    .flatMap((st) => st.sites.filter((s) => s.biomarker === bio))
    .map((s) => {
      const series = siteSeries(s.id, state.scans.filter((x) => +new Date(x.at) >= Date.now() - days * 86400000), bio);
      const last = series[series.length - 1];
      return { s, series, last, status: classify(last?.value ?? null, b.bands) };
    })
    .sort((x, y) => STATUS_RANK[y.status] - STATUS_RANK[x.status] || x.s.toothUniversal - y.s.toothUniversal);

  const vals = [...pts.map((p) => p.y), ...sites.map((x) => x.last?.value ?? null)].filter((v): v is number => v != null);
  const lo = Math.min(...vals, b.bands.high);
  const hi = Math.max(...vals, b.bands.mild);
  const pad = (hi - lo) * 0.15 || 0.1;
  const yTicks = niceTicks(Math.max(0, lo - pad), hi + pad);
  const yDomain: [number, number] = [Math.min(yTicks[0], lo - pad), Math.max(yTicks[yTicks.length - 1], hi + pad)];
  const band = b.bands.concern === 'low' ? { from: b.bands.mild, to: yDomain[1], label: 'Research range' } : { from: yDomain[0], to: b.bands.mild, label: 'Research range' };
  const dayFmt = (x: number) =>
    days <= 1 ? new Date(x).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton name="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <DemoBadge />
      </View>

      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
        <T v="label">Biomarker · {b.unit}</T>
        <T v="display" style={{ marginTop: 4 }}>{b.name}</T>
        <T v="small" style={{ marginTop: 6 }}>{b.what}</T>
      </View>

      {/* Current */}
      <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <T v="number" style={{ fontSize: 52, letterSpacing: -1.2, fontWeight: '400' }}>{formatValue(b, stat.median)}</T>
          <T v="body" style={{ marginLeft: 6, color: colors.textMuted }}>{unitSuffix(b).trim() || 'pH'}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: 4 }}>
          <StatusTag status={stat.status} label={statLine(stat)} />
        </View>
        <Meta style={{ marginTop: 6 }}>
          Median of {stat.sites} sites{stat.at ? ` · ${scanTimeLabel(stat.at)}` : ''}
        </Meta>
      </View>

      {/* Chart */}
      <View style={{ marginTop: space.xl }}>
        <Segmented fill options={RANGES} value={range} onChange={setRange} />
      </View>
      <View style={{ paddingHorizontal: space.sm, marginTop: space.lg }}>
        {pts.length ? (
          <LineChart
            series={[{ id: 'm', label: 'Median', color: colors.text, points: pts, markerColor: (p) => STATUS_HEX[classify(p.y, b.bands)] }]}
            height={220}
            yDomain={yDomain}
            yTicks={yTicks}
            formatY={fmt}
            xDomain={xDomain}
            xTicks={[xDomain[0], (xDomain[0] + xDomain[1]) / 2, xDomain[1]]}
            formatX={dayFmt}
            formatTooltipX={(x) => new Date(x).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            band={band}
            thresholds={[{ y: b.bands.elevated, label: `Attention ${b.bands.concern === 'low' ? '<' : '>'} ${fmt(b.bands.elevated)}` }]}
            surface={colors.bg}
          />
        ) : (
          <View style={styles.empty}>
            <T v="small">No scans in this period</T>
            <Meta style={{ marginTop: 4 }}>Choose a longer range or wait for the next case sync.</Meta>
          </View>
        )}
      </View>
      <Meta style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>
        Shaded: configured research range (not clinically validated) · touch the chart to inspect
      </Meta>

      {/* Locations */}
      <Section title="By location">
        <View style={{ marginHorizontal: -space.lg, marginBottom: space.md }}>
          <Segmented fill options={[{ key: 'both', label: 'All teeth' }, { key: 'upper', label: 'Upper' }, { key: 'lower', label: 'Lower' }]} value={where} onChange={setWhere} />
        </View>
        <View style={styles.list}>
          {sites.map(({ s, series, last, status }, i) => {
            const t = siteTitle(s, numbering);
            return (
              <Pressable
                key={s.id}
                onPress={() => router.push({ pathname: '/tooth', params: { u: String(s.toothUniversal) } })}
                style={({ pressed }) => [styles.row, i > 0 && styles.border, pressed && { backgroundColor: colors.surfaceRaised }]}
              >
                <StatusDot status={status} size={6} />
                <View style={{ width: 116 }}>
                  <T v="small" style={{ color: colors.text }} numberOfLines={1}>{t.number} · {t.surface}</T>
                  <Meta style={{ fontSize: 11 }}>{t.tooth.shortName}</Meta>
                </View>
                <View style={{ flex: 1 }}>
                  <Sparkline points={series.map((p) => p.value)} bands={b.bands} height={24} domain={yDomain} />
                </View>
                <T v="bodyStrong" style={{ width: 52, textAlign: 'right', fontVariant: ['tabular-nums'], color: last?.value == null ? colors.textMuted : colors.text }}>
                  {last?.value == null ? '—' : fmt(last.value)}
                </T>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="About this measurement">
        <T v="small">{b.limitation}</T>
        <Meta style={{ marginTop: space.sm }}>
          Thresholds: borderline {b.bands.concern === 'low' ? '<' : '>'} {fmt(b.bands.mild)}, attention {b.bands.concern === 'low' ? '<' : '>'} {fmt(b.bands.elevated)}, high {b.bands.concern === 'low' ? '<' : '>'} {fmt(b.bands.high)}{unitSuffix(b)}
        </Meta>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { height: 200, alignItems: 'center', justifyContent: 'center', marginHorizontal: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
