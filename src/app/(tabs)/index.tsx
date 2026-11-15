import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import BiomarkerLegend from '../../components/BiomarkerLegend';
import CaseIndicator from '../../components/CaseIndicator';
import Icon from '../../components/Icon';
import Loupe from '../../components/Loupe';
import { Card, IconButton, Screen, Section, Segmented, StatusDot, T } from '../../components/ui';
import { BIOMARKER_ORDER, BIOMARKERS, STATUS_RANK } from '../../domain/biomarkers';
import { pct } from '../../domain/fouling';
import type { Insight } from '../../domain/insights';
import { RETAINER_TEETH, searchTeeth, toothByUniversal } from '../../domain/teeth';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { regionsForScan, ViewMode } from '../../three/regions';
import { colors, font, radius, space } from '../../theme/tokens';

export function scanTimeLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(Date.now() - 86400000);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `today at ${time}`;
  if (d.toDateString() === y.toDateString()) return `yesterday at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

export function InsightCard({ i, width }: { i: Insight; width?: number }) {
  const s = i.status === 'info' ? null : i.status;
  const bm = i.biomarker ? BIOMARKERS[i.biomarker as keyof typeof BIOMARKERS] : null;
  return (
    <Card style={{ width, minHeight: 150 }} onPress={i.action ? () => router.push(i.action!.href as never) : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {bm && i.kind === 'finding' ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: bm.color }} />
        ) : s ? (
          <StatusDot status={s} />
        ) : (
          <Icon name="info" size={14} color={colors.textSecondary} />
        )}
        <T v="label" style={{ fontSize: 10 }}>
          {i.kind === 'finding' ? bm?.shortName ?? 'Finding' : i.kind === 'stable' ? 'Stable' : i.kind === 'strip' ? 'Strip' : i.kind === 'quality' ? 'Scan quality' : 'Routine'}
        </T>
      </View>
      <T v="bodyStrong" style={{ marginTop: space.md }}>{i.title}</T>
      <T v="small" style={{ marginTop: 6 }} numberOfLines={4}>{i.summary}</T>
    </Card>
  );
}

export default function Home() {
  const params = useLocalSearchParams<{ tooth?: string }>();
  const { latestScan, stripById, analysis, insights, recommendations, state, arch, setArch } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const [mode, setMode] = useState<ViewMode>('overview');
  const [loupe, setLoupe] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const numbering = state.settings.numbering;
  const H = Dimensions.get('window').height;
  const W = Dimensions.get('window').width;

  // Deep links (e.g. from an insight) open the magnifier on that tooth.
  useEffect(() => {
    if (!params.tooth) return;
    const u = Number(params.tooth);
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const regions = useMemo(() => regionsForScan(latestScan, strip, mode), [latestScan, strip, mode, state.rev]);

  // Arch map: each tooth takes the biomarker colour of its most concerning reading; in-range teeth stay plain.
  const marks = useMemo(() => {
    const best = new Map<number, { rank: number; color: string; dashed?: boolean }>();
    analysis?.results.forEach((r) => {
      if (mode !== 'overview' && r.site.biomarker !== mode) return;
      if (r.status === 'normal') return;
      const rank = STATUS_RANK[r.status];
      const prev = best.get(r.site.toothUniversal);
      if (!prev || rank > prev.rank)
        best.set(r.site.toothUniversal, { rank, color: r.status === 'unavailable' ? colors.unavailable : BIOMARKERS[r.site.biomarker].color, dashed: r.status === 'unavailable' });
    });
    return best;
  }, [analysis, mode]);
  const concernBiomarkers = [...new Set((analysis?.results ?? []).filter((r) => STATUS_RANK[r.status] >= 1).map((r) => r.site.biomarker))];

  const openTooth = (u: number) => {
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
  };
  const onSelect = (s: Selection | null) => {
    if (s?.tooth) openTooth(s.tooth);
  };

  const quality = analysis ? analysis.usable / analysis.total : 0;
  const top = insights.filter((i) => i.kind !== 'routine').slice(0, 5);
  const results = query ? searchTeeth(query, numbering).filter((t) => RETAINER_TEETH.includes(t)).slice(0, 6) : [];
  const modeOptions = [
    { key: 'overview' as ViewMode, label: 'All' },
    ...BIOMARKER_ORDER.filter((id) => strip?.supported.includes(id)).map((id) => ({ key: id as ViewMode, label: BIOMARKERS[id].shortName })),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={styles.header}>
          <ArchToggle onChange={() => setLoupe(null)} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton name="search" onPress={() => setSearching((v) => !v)} />
            <IconButton name="profile" onPress={() => router.push('/profile')} />
          </View>
        </View>

        {searching ? (
          <View style={{ paddingHorizontal: space.xl, marginTop: space.md }}>
            <View style={styles.search}>
              <Icon name="search" size={16} color={colors.textMuted} />
              <TextInput
                autoFocus
                value={query}
                onChangeText={setQuery}
                placeholder="Tooth number or name, e.g. 3 or “lower left molar”"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
            </View>
            {results.map((r) => (
              <Pressable
                key={r.universal}
                onPress={() => { openTooth(r.universal); setSearching(false); setQuery(''); }}
                style={{ paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <T v="bodyStrong" style={{ fontSize: 14 }}>{r.name}</T>
                <T v="small">#{r.universal} · FDI {r.fdi}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <Segmented options={modeOptions} value={mode} onChange={setMode} />
        </View>

        {/* Hero */}
        <View style={{ height: Math.max(320, H * 0.45) }}>
          <RetainerView
            key={arch}
            arch={arch}
            style={{ flex: 1 }}
            regions={regions}
            reveal
            selectedTooth={loupe}
            onSelect={onSelect}
            active={focused && loupe == null}
          />
          <View pointerEvents="none" style={styles.hint}>
            <Icon name="zoom" size={13} color={colors.textMuted} />
            <T v="small" style={{ fontSize: 11, color: colors.textMuted }}>Tap a tooth to zoom in</T>
          </View>
        </View>

        <T v="small" style={{ textAlign: 'center', paddingHorizontal: space.xl, color: colors.textSecondary }}>
          {latestScan ? `Last scanned ${scanTimeLabel(latestScan.at)} · Scan quality ${pct(quality)}` : 'No scans yet'}
        </T>
        <View style={{ marginTop: space.md }}>
          <BiomarkerLegend mode={mode === 'signal' ? 'overview' : mode} only={mode === 'overview' ? concernBiomarkers : undefined} />
        </View>
        <View style={{ alignItems: 'center', marginTop: space.lg }}>
          <CaseIndicator />
        </View>

        <Section title="Dental arch" action={<T v="small">{numbering === 'universal' ? 'Universal' : 'FDI'} numbering</T>}>
          <Card style={{ paddingHorizontal: 6 }}>
            <ArchDiagram key={arch} arch={arch} marks={marks} selected={loupe} onSelect={openTooth} numbering={numbering} />
            <T v="small" style={{ textAlign: 'center', fontSize: 11 }}>Tap any tooth to zoom in</T>
          </Card>
        </Section>

        <Section style={{ paddingHorizontal: 0 }}>
          <T v="heading" style={{ paddingHorizontal: space.xl, marginBottom: space.md }}>Your latest insights</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: space.xl }} snapToInterval={W * 0.72 + 10} decelerationRate="fast">
            {top.map((i) => (
              <InsightCard key={i.id} i={i} width={W * 0.72} />
            ))}
          </ScrollView>
        </Section>

        <Section title="Recommended for you">
          <Card style={{ paddingVertical: 4 }}>
            {recommendations.map((r, idx) => (
              <View key={r.id} style={{ paddingVertical: 14, borderTopWidth: idx ? 1 : 0, borderTopColor: colors.hairline }}>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <T v="label" style={{ fontSize: 11, marginTop: 3, color: colors.textMuted }}>{String(idx + 1).padStart(2, '0')}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" style={{ fontSize: 14.5 }}>{r.text}</T>
                    <T v="small" style={{ marginTop: 4 }}>Why: {r.why}</T>
                  </View>
                </View>
              </View>
            ))}
          </Card>
          <Pressable onPress={() => router.push('/about')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg }}>
            <Icon name="info" size={14} color={colors.textMuted} />
            <T v="small" style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>
              These readings are research indicators and do not diagnose decay or gum disease. How findings are made →
            </T>
          </Pressable>
        </Section>
      </Screen>

      <Loupe tooth={loupe} regions={regions} onClose={() => setLoupe(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 14, outlineStyle: 'none' } as object,
  hint: { position: 'absolute', bottom: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 },
});
