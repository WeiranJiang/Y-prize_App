/**
 * Tooth-level monitoring: an occlusal schematic of one tooth with its
 * measurement locations, and the readings at the selected location.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import Sparkline from '../components/charts/Sparkline';
import { DemoBadge, Divider, IconButton, Meta, Screen, Section, StatusDot, StatusTag, T } from '../components/ui';
import { crownFor, SurfaceId } from '../domain/arch';
import { confidenceOf, siteSeries, SiteResult, surfaceLabel } from '../domain/analysis';
import { BIOMARKERS, formatValue, Status, STATUS_RANK, unitSuffix } from '../domain/biomarkers';
import { parseTooth, retainerTeeth, toothByUniversal, toothNumber } from '../domain/teeth';
import { useStore } from '../state/store';
import { STATUS_HEX } from '../three/regions';
import { colors, font, radius, space } from '../theme/tokens';
import { scanTimeLabel } from '../domain/dates';

const ORDER: SurfaceId[] = ['buccal', 'mesial', 'distal', 'lingual', 'gingival', 'occlusal'];

const worst = (rs: SiteResult[]): Status =>
  rs.reduce<Status>((w, r) => (STATUS_RANK[r.status] > STATUS_RANK[w] ? r.status : w), rs.length ? 'normal' : 'unavailable');

function ToothSchematic({ universal, groups, selected, onSelect }: { universal: number; groups: Map<SurfaceId, SiteResult[]>; selected: SurfaceId | null; onSelect: (s: SurfaceId) => void }) {
  const t = toothByUniversal(universal);
  const c = crownFor(t.arch, t.position);
  const W = 320;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2 + 8;
  const k = Math.min(150 / c.w, 130 / c.b);
  const a = (c.w / 2) * k;
  const b = (c.b / 2) * k;
  const p = t.position <= 2 ? 2.3 : t.position === 3 ? 2.2 : t.position <= 5 ? 2.5 : 2.9;
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const th = (i / 96) * Math.PI * 2;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const x = cx + a * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p);
    const y = cy + b * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p);
    pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  const outline = pts.join('') + 'Z';
  // Mesial faces the midline: on the patient's right teeth that is screen-right.
  const mesialRight = t.side === 'right';
  const pos: Record<SurfaceId, [number, number]> = {
    buccal: [cx, cy - b * 0.62],
    lingual: [cx, cy + b * 0.62],
    mesial: [mesialRight ? cx + a * 0.86 : cx - a * 0.86, cy],
    distal: [mesialRight ? cx - a * 0.86 : cx + a * 0.86, cy],
    gingival: [cx, cy - b - 22],
    occlusal: [cx, cy],
  };
  const lingualWord = t.arch === 'upper' ? 'PALATAL' : 'LINGUAL';
  const buccalWord = t.position <= 3 ? 'LABIAL' : 'BUCCAL';

  // Anatomical detail: fissures / edges by tooth type.
  const detail =
    t.position >= 6
      ? `M${cx - a * 0.55},${cy} L${cx + a * 0.55},${cy} M${cx},${cy - b * 0.45} L${cx},${cy + b * 0.45}`
      : t.position >= 4
        ? `M${cx - a * 0.5},${cy} Q${cx},${cy + b * 0.12} ${cx + a * 0.5},${cy}`
        : t.position === 3
          ? `M${cx - a * 0.45},${cy + b * 0.1} L${cx},${cy - b * 0.15} L${cx + a * 0.45},${cy + b * 0.1}`
          : `M${cx - a * 0.7},${cy - b * 0.1} L${cx + a * 0.7},${cy - b * 0.1}`;

  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* orientation labels */}
      <SvgText x={cx} y={14} fontSize={10} fill={colors.textMuted} textAnchor="middle" fontFamily={font.family} fontWeight="600" letterSpacing={0.8}>{buccalWord}</SvgText>
      <SvgText x={cx} y={H - 4} fontSize={10} fill={colors.textMuted} textAnchor="middle" fontFamily={font.family} fontWeight="600" letterSpacing={0.8}>{lingualWord}</SvgText>
      <SvgText x={12} y={cy + 3} fontSize={10} fill={colors.textMuted} fontFamily={font.family} fontWeight="600" letterSpacing={0.8}>{mesialRight ? 'D' : 'M'}</SvgText>
      <SvgText x={W - 12} y={cy + 3} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font.family} fontWeight="600" letterSpacing={0.8}>{mesialRight ? 'M' : 'D'}</SvgText>

      {/* gingival margin (buccal side) */}
      <Path d={`M${cx - a * 0.85},${cy - b * 0.7} Q${cx},${cy - b - 34} ${cx + a * 0.85},${cy - b * 0.7}`} stroke={colors.border} strokeWidth={1} fill="none" strokeDasharray="2 4" />
      {/* crown */}
      <Path d={outline} fill="#121212" stroke={colors.textSecondary} strokeWidth={1.25} />
      <Path d={detail} stroke={colors.border} strokeWidth={1} fill="none" strokeLinecap="round" />
      <Line x1={cx - a - 10} x2={cx + a + 10} y1={cy} y2={cy} stroke="#1C1C1C" strokeWidth={1} />

      {ORDER.filter((s) => groups.has(s)).map((s) => {
        const [x, y] = pos[s];
        const st = worst(groups.get(s)!);
        const on = selected === s;
        return (
          <G key={s} onPress={() => onSelect(s)}>
            <Circle cx={x} cy={y} r={18} fill="transparent" />
            <Circle cx={x} cy={y} r={on ? 13 : 11} fill={on ? colors.surfaceRaised : colors.bg} stroke={on ? colors.text : colors.textSecondary} strokeWidth={on ? 1.5 : 1} />
            {st === 'unavailable' ? (
              <Circle cx={x} cy={y} r={3.5} fill="none" stroke={colors.textMuted} strokeWidth={1} />
            ) : (
              <Circle cx={x} cy={y} r={3.5} fill={STATUS_HEX[st]} />
            )}
          </G>
        );
      })}
    </Svg>
  );
}

export default function Tooth() {
  const { u } = useLocalSearchParams<{ u?: string }>();
  const { analysis, state, arch, setArch, latestScan } = useStore();
  const [tooth, setTooth] = useState(parseTooth(u) ?? 3);
  const [surface, setSurface] = useState<SurfaceId | null>(null);
  const numbering = state.settings.numbering;

  useEffect(() => {
    const a = toothByUniversal(tooth).arch;
    if (a !== arch) setArch(a);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooth]);

  const results = (analysis?.results ?? []).filter((r) => r.site.toothUniversal === tooth);
  const groups = useMemo(() => {
    const m = new Map<SurfaceId, SiteResult[]>();
    results.forEach((r) => m.set(r.site.surface, [...(m.get(r.site.surface) ?? []), r]));
    m.forEach((rs) => rs.sort((x, y) => STATUS_RANK[y.status] - STATUS_RANK[x.status]));
    return m;
  }, [results]);
  const surfaces = ORDER.filter((s) => groups.has(s));
  const sel = surface && groups.has(surface) ? surface : surfaces.slice().sort((x, y) => STATUS_RANK[worst(groups.get(y)!)] - STATUS_RANK[worst(groups.get(x)!)])[0] ?? null;
  const t = toothByUniversal(tooth);
  const teeth = retainerTeeth(t.arch).slice().sort((x, y) => x.universal - y.universal);
  const statusByTooth = new Map<number, Status>();
  (analysis?.results ?? []).forEach((r) => {
    const prev = statusByTooth.get(r.site.toothUniversal);
    if (!prev || STATUS_RANK[r.status] > STATUS_RANK[prev]) statusByTooth.set(r.site.toothUniversal, r.status);
  });

  return (
    <Screen>
      <View style={styles.nav}>
        <IconButton name="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <DemoBadge />
      </View>

      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
        <T v="label">{toothNumber(t, numbering)} · {numbering === 'universal' ? `FDI ${t.fdi}` : `Universal ${t.universal}`}</T>
        <T v="display" style={{ marginTop: 4, fontSize: 28 }}>{t.name}</T>
        <Meta style={{ marginTop: 6 }}>
          {results.length ? `${results.length} sensors · ${surfaces.length} locations` : 'No sensors on this tooth'}
          {latestScan ? ` · ${scanTimeLabel(latestScan.at)}` : ''}
        </Meta>
      </View>

      {/* Tooth selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 6, marginTop: space.lg }}>
        {teeth.map((x) => {
          const on = x.universal === tooth;
          const st = statusByTooth.get(x.universal);
          return (
            <Pressable key={x.universal} onPress={() => { setTooth(x.universal); setSurface(null); }} style={[styles.toothTile, on && styles.toothOn]} accessibilityLabel={x.name}>
              <T v="small" style={{ color: on ? colors.text : colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                {numbering === 'universal' ? x.universal : x.fdi}
              </T>
              <View style={{ height: 6, marginTop: 4, justifyContent: 'center' }}>
                {st && st !== 'normal' ? <StatusDot status={st} size={5} /> : st ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.textMuted }} /> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Schematic */}
      <View style={[styles.panel, { marginTop: space.lg, marginHorizontal: space.lg, paddingVertical: space.md }]}>
        {results.length ? (
          <ToothSchematic universal={tooth} groups={groups} selected={sel} onSelect={setSurface} />
        ) : (
          <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
            <T v="small">No measurement locations on this tooth.</T>
            <Meta style={{ marginTop: 4 }}>Nearby readings are not estimated.</Meta>
          </View>
        )}
        {surfaces.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.md, gap: 6 }}>
            {surfaces.map((s) => {
              const on = s === sel;
              return (
                <Pressable key={s} onPress={() => setSurface(s)} style={[styles.locChip, on && styles.locOn]}>
                  <StatusDot status={worst(groups.get(s)!)} size={5} />
                  <T v="small" style={{ color: on ? colors.text : colors.textSecondary, fontSize: 12.5 }}>{surfaceLabel(t, s)}</T>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {/* Readings at the selected location */}
      {sel ? (
        <Section title={`${surfaceLabel(t, sel)} · readings`}>
          <View style={styles.panel}>
            {groups.get(sel)!.map((r, i) => {
              const b = BIOMARKERS[r.site.biomarker];
              const series = siteSeries(r.site.id, state.scans, r.site.biomarker).slice(-12);
              return (
                <View key={r.site.id} style={[styles.reading, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <T v="small" style={{ color: colors.textSecondary }}>{b.name}</T>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
                      <T v="number" style={{ fontSize: 26 }}>{formatValue(b, r.reading.value)}</T>
                      <T v="small" style={{ marginLeft: 4, color: colors.textMuted }}>{unitSuffix(b).trim() || 'pH'}</T>
                    </View>
                    <View style={{ marginTop: 6 }}>
                      <StatusTag status={r.status} label={r.status === 'unavailable' ? 'Not measured' : r.status === 'normal' ? 'In range' : b.statusWords[r.status]} />
                    </View>
                    <Meta style={{ marginTop: 6 }}>
                      {r.reading.value != null ? `± ${formatValue(b, r.reading.uncertainty)} · ${confidenceOf(r.reading.quality)} quality` : 'Signal below quality floor'} · {r.site.id}
                    </Meta>
                  </View>
                  <View style={{ width: 112, justifyContent: 'center' }}>
                    <Sparkline points={series.map((p) => p.value)} bands={b.bands} height={40} />
                    <Meta style={{ textAlign: 'right', fontSize: 11 }}>{r.change == null ? ' ' : Math.abs(r.change) < 0.5 * Math.pow(10, -b.decimals) ? 'No change' : `${r.change > 0 ? '+' : ''}${formatValue(b, r.change)} vs prev.`}</Meta>
                  </View>
                </View>
              );
            })}
          </View>
          <Pressable onPress={() => router.navigate({ pathname: '/trends', params: { tooth: String(tooth) } })} style={{ marginTop: space.md }}>
            <T v="small" style={{ color: colors.text }}>View full history ›</T>
          </Pressable>
        </Section>
      ) : null}

      {/* All locations summary */}
      {surfaces.length > 1 ? (
        <Section title="All locations">
          <View style={styles.panel}>
            {surfaces.map((s, i) => (
              <Pressable key={s} onPress={() => setSurface(s)} style={[styles.locRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <StatusDot status={worst(groups.get(s)!)} size={6} />
                <T v="small" style={{ flex: 1, color: colors.text }}>{surfaceLabel(t, s)}</T>
                <T v="small">{groups.get(s)!.map((r) => BIOMARKERS[r.site.biomarker].shortName).join(' · ')}</T>
              </Pressable>
            ))}
          </View>
          <Divider style={{ marginTop: space.xl, opacity: 0 }} />
        </Section>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  nav: { paddingHorizontal: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toothTile: { width: 40, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  toothOn: { backgroundColor: colors.surfaceRaised, borderColor: colors.textSecondary },
  panel: { marginHorizontal: 0, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  locChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  locOn: { backgroundColor: colors.surfaceRaised, borderColor: colors.textSecondary },
  reading: { flexDirection: 'row', gap: space.md, padding: space.lg },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 13 },
});
