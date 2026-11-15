import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import BiomarkerCard from '../../components/BiomarkerCard';
import Icon from '../../components/Icon';
import Loupe from '../../components/Loupe';
import { Button, Divider, IconButton, Legend, Meta, Screen, Section, StatusDot, T } from '../../components/ui';
import { BIOMARKER_ORDER, STATUS_RANK } from '../../domain/biomarkers';
import { pct } from '../../domain/fouling';
import { biomarkerStat, buildOverview } from '../../domain/overview';
import { RETAINER_TEETH, searchTeeth, toothByUniversal } from '../../domain/teeth';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { regionsForScan, STATUS_HEX } from '../../three/regions';
import { colors, font, radius, space } from '../../theme/tokens';

export function scanTimeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function Home() {
  const params = useLocalSearchParams<{ tooth?: string }>();
  const { latestScan, latestScanFor, stripById, analysis, insights, recommendations, state, arch, setArch } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const [loupe, setLoupe] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const numbering = state.settings.numbering;
  const H = Dimensions.get('window').height;

  useEffect(() => {
    if (!params.tooth) return;
    const u = Number(params.tooth);
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth]);

  const o = useMemo(() => buildOverview(state.scans, state.strips, 30), [state.scans, state.strips, state.rev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => BIOMARKER_ORDER.map((id) => biomarkerStat(id, state.scans, state.strips, 30)), [state.scans, state.strips, state.rev]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const regions = useMemo(() => regionsForScan(latestScan, strip, 'overview'), [latestScan, strip, state.rev]);

  const marks = useMemo(() => {
    const best = new Map<number, { rank: number; color: string; dashed?: boolean }>();
    analysis?.results.forEach((r) => {
      if (r.status === 'normal') return;
      const rank = STATUS_RANK[r.status];
      const prev = best.get(r.site.toothUniversal);
      if (!prev || rank > prev.rank) best.set(r.site.toothUniversal, { rank, color: STATUS_HEX[r.status], dashed: r.status === 'unavailable' });
    });
    return best;
  }, [analysis]);

  const openTooth = (u: number) => {
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
  };
  const onSelect = (s: Selection | null) => {
    if (s?.tooth) openTooth(s.tooth);
  };

  // Whole-mouth figures from the latest scan of each arch.
  const latestBoth = (['upper', 'lower'] as const).map((a) => latestScanFor(a)).filter(Boolean);
  const readings = latestBoth.flatMap((s) => s!.readings);
  const usable = readings.filter((r) => r.value != null).length;
  const attention = stats.reduce((n, s) => n + s.attention, 0);
  const borderline = stats.reduce((n, s) => n + s.borderline, 0);
  const lastAt = latestBoth.map((s) => s!.at).sort().pop();
  const findings = insights.filter((i) => i.kind !== 'routine' && i.kind !== 'stable').slice(0, 4);
  const results = query ? searchTeeth(query, numbering).filter((t) => RETAINER_TEETH.includes(t)).slice(0, 6) : [];
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <T v="label">{today}</T>
            <T v="display" style={{ marginTop: 4 }}>Oral health</T>
          </View>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <IconButton name="search" label="Search teeth" onPress={() => setSearching((v) => !v)} />
            <IconButton name="profile" label="Profile" onPress={() => router.push('/profile')} />
          </View>
        </View>

        {searching ? (
          <View style={{ paddingHorizontal: space.lg, marginTop: space.md }}>
            <View style={styles.search}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Tooth number or name"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
            </View>
            {results.map((r) => (
              <Pressable key={r.universal} onPress={() => { openTooth(r.universal); setSearching(false); setQuery(''); }} style={styles.result}>
                <T v="bodyStrong" style={{ fontSize: 15 }}>{r.name}</T>
                <T v="small">#{r.universal} · FDI {r.fdi}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Overview */}
        <View style={{ paddingHorizontal: space.lg, marginTop: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <T v="number" style={{ fontSize: 56, letterSpacing: -1.5, fontWeight: '400' }}>{o.overall != null ? Math.round(o.overall * 100) : '—'}</T>
                <T v="number" style={{ fontSize: 24, color: colors.textSecondary, fontWeight: '400', marginLeft: 2 }}>%</T>
              </View>
              <T v="small" style={{ marginTop: -2 }}>of readings in range</T>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              {attention ? (
                <View style={styles.statusRow}><StatusDot status="high" size={6} /><T v="small" style={{ color: colors.text }}>{attention} need attention</T></View>
              ) : null}
              {borderline ? (
                <View style={styles.statusRow}><StatusDot status="mild" size={6} /><T v="small" style={{ color: colors.text }}>{borderline} borderline</T></View>
              ) : null}
              {!attention && !borderline ? (
                <View style={styles.statusRow}><StatusDot status="normal" size={6} /><T v="small" style={{ color: colors.text }}>All in range</T></View>
              ) : null}
            </View>
          </View>

          <View style={styles.metrics}>
            <Metric label="Sites read" value={`${usable}`} sub={`of ${readings.length}`} />
            <View style={styles.vr} />
            <Metric label="Trend · 30D" value={o.direction === 'improving' ? 'Improving' : o.direction === 'worsening' ? 'Declining' : 'Steady'} />
            <View style={styles.vr} />
            <Metric label="Scan quality" value={readings.length ? pct(usable / readings.length) : '—'} />
          </View>
          <Meta style={{ marginTop: space.md }}>
            {lastAt ? `Last scan ${scanTimeLabel(lastAt)}` : 'No scans yet'} · Upper and lower · Demo data
          </Meta>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.lg }}>
            <Button label="Start scan" icon="scan" onPress={() => router.push('/scan')} style={{ flex: 1 }} />
            <Pressable onPress={() => router.push('/scan')} style={styles.caseChip} accessibilityLabel="Scanning case status">
              <View style={[styles.dot, { backgroundColor: state.caseStatus === 'disconnected' ? colors.textMuted : colors.normal }]} />
              <T v="small" style={{ color: colors.textSecondary, fontSize: 12 }}>Case {Math.round(state.caseBattery * 100)}%</T>
            </Pressable>
          </View>
        </View>

        {/* Biomarkers */}
        <Section title="Biomarkers" action={<Pressable onPress={() => router.navigate('/overview')} hitSlop={8}><T v="small" style={{ color: colors.text }}>Overview</T></Pressable>}>
          <View style={{ gap: space.sm }}>
            {[0, 2, 4].map((i) => (
              <View key={i} style={{ flexDirection: 'row', gap: space.sm }}>
                <BiomarkerCard s={stats[i]} />
                <BiomarkerCard s={stats[i + 1]} />
              </View>
            ))}
          </View>
          <Meta style={{ marginTop: space.sm }}>Median across monitored sites · 30-day trend</Meta>
        </Section>

        {/* Tooth map */}
        <Section title="Tooth map" action={<ArchToggle onChange={() => setLoupe(null)} />}>
          <View style={styles.mapCard}>
            <View style={{ height: Math.max(260, H * 0.34) }}>
              <RetainerView key={arch} arch={arch} style={{ flex: 1 }} regions={regions} reveal selectedTooth={loupe} onSelect={onSelect} active={focused && loupe == null} />
              <View pointerEvents="none" style={styles.hint}>
                <Icon name="zoom" size={12} color={colors.textMuted} />
                <T v="small" style={{ fontSize: 11, color: colors.textMuted }}>Tap a tooth to inspect</T>
              </View>
            </View>
            <Divider />
            <View style={{ paddingHorizontal: 6, paddingTop: space.sm }}>
              <ArchDiagram key={arch} arch={arch} marks={marks} selected={loupe} onSelect={openTooth} numbering={numbering} />
            </View>
            <View style={{ paddingBottom: space.md }}>
              <Legend items={[{ status: 'mild', label: 'Borderline' }, { status: 'high', label: 'Needs attention' }]} />
            </View>
          </View>
        </Section>

        {/* Findings */}
        <Section title="Findings">
          <View style={styles.list}>
            {findings.map((i, idx) => (
              <Pressable key={i.id} onPress={i.action ? () => router.push(i.action!.href as never) : undefined} style={({ pressed }) => [styles.listRow, idx > 0 && styles.listBorder, pressed && { backgroundColor: colors.surfaceRaised }]}>
                <View style={{ paddingTop: 6 }}>
                  <StatusDot status={i.status === 'info' ? 'unavailable' : i.status} size={6} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ fontSize: 15 }}>{i.title}</T>
                  <T v="small" style={{ marginTop: 2 }} numberOfLines={2}>{i.summary}</T>
                </View>
                <Icon name="chevron" size={14} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Recommended">
          <View style={styles.list}>
            {recommendations.map((r, idx) => (
              <View key={r.id} style={[styles.listRow, idx > 0 && styles.listBorder]}>
                <T v="small" style={{ width: 18, color: colors.textMuted, paddingTop: 1 }}>{idx + 1}</T>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ fontSize: 15 }}>{r.text}</T>
                  <T v="small" style={{ marginTop: 2 }}>{r.why}</T>
                </View>
              </View>
            ))}
          </View>
          <Pressable onPress={() => router.push('/about')} style={{ marginTop: space.lg }}>
            <Meta>Research indicators — not a diagnosis of decay or gum disease. How findings are made ›</Meta>
          </Pressable>
        </Section>
      </Screen>

      <Loupe tooth={loupe} regions={regions} onClose={() => setLoupe(null)} />
    </View>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <T v="small" style={{ fontSize: 11.5, color: colors.textMuted }}>{label}</T>
      <T v="bodyStrong" style={{ fontSize: 17, marginTop: 4, fontVariant: ['tabular-nums'] }}>
        {value}
        {sub ? <T v="small" style={{ fontSize: 12, color: colors.textMuted }}> {sub}</T> : null}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.family, fontSize: 15, outlineStyle: 'none' } as object,
  result: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metrics: { flexDirection: 'row', marginTop: space.xl, paddingVertical: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  vr: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: space.md },
  caseChip: { height: 48, paddingHorizontal: 14, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dot: { width: 6, height: 6, borderRadius: 3 },
  mapCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  hint: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  listRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, alignItems: 'flex-start' },
  listBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
