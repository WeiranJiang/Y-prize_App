import { router, useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import BiomarkerLegend from '../../components/BiomarkerLegend';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import Icon from '../../components/Icon';
import Loupe from '../../components/Loupe';
import { Button, IconButton, Screen, Section, Segmented, StatusDot, T } from '../../components/ui';
import { BIOMARKERS, BIOMARKER_COLORS, BIOMARKER_ORDER, BiomarkerId } from '../../domain/biomarkers';
import { parseTooth, RETAINER_TEETH, searchTeeth, toothByUniversal } from '../../domain/teeth';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { attentionSites, attentionLevel, ATTENTION_COLORS } from '../../domain/attention';
import { siteTeeth } from '../../domain/sensorLayout';
import { regionsForScan } from '../../three/regions';
import { colors, font, radius, space } from '../../theme/tokens';

export default function Home() {
  const params = useLocalSearchParams<{ tooth?: string }>();
  const { latestScan, stripById, analysis, insights, recommendations, state, arch, setArch } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const [loupe, setLoupe] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const [sensorType, setSensorType] = useState<'overview' | BiomarkerId>('overview');
  const [mapView, setMapView] = useState<'3d' | 'chart'>('3d');
  const [allRecommendations, setAllRecommendations] = useState(false);
  const [query, setQuery] = useState('');
  const numbering = state.settings.numbering;
  const H = Dimensions.get('window').height;

  useEffect(() => {
    const u = parseTooth(params.tooth);
    if (u == null) return;
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const regions = useMemo(() => regionsForScan(latestScan, strip, sensorType), [latestScan, strip, sensorType, state.rev]);

  const flaggedSites = attentionSites(latestScan, strip, sensorType);
  const attentionMarks = new Map<number, { color: string }>();
  for (const site of flaggedSites) {
    const color = ATTENTION_COLORS[attentionLevel(latestScan, site)];
    for (const tooth of siteTeeth(site)) {
      if (attentionMarks.get(tooth)?.color !== colors.high) attentionMarks.set(tooth, { color });
    }
  }

  const openTooth = (u: number) => {
    const a = toothByUniversal(u).arch;
    if (a !== arch) setArch(a);
    setLoupe(u);
  };
  const onSelect = (s: Selection | null) => {
    if (s?.tooth) openTooth(s.tooth);
  };

  const findings = insights.filter((i) => i.kind !== 'routine' && i.kind !== 'stable').slice(0, 4);
  const results = query ? searchTeeth(query, numbering).filter((t) => RETAINER_TEETH.includes(t)).slice(0, 6) : [];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>

            <T v="display" style={{ marginTop: 4 }}>OraCare</T>
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
                maxLength={60}
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

        {/* Tooth map */}
        <Section title="Tooth map" action={<ArchToggle onChange={() => setLoupe(null)} />}>
          <View style={styles.mapCard}>
            <Segmented fill style={{ paddingHorizontal: space.md, paddingTop: space.md }} options={[{ key: '3d', label: '3D view' }, { key: 'chart', label: 'Tooth chart' }]} value={mapView} onChange={setMapView} />
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, padding: space.md }}>
              {(['overview', ...BIOMARKER_ORDER] as const).map(id => <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: sensorType === id }} onPress={() => setSensorType(id)} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: sensorType === id ? colors.surfaceRaised : colors.bg2, borderWidth: 1, borderColor: sensorType === id ? colors.textSecondary : colors.border }}>
                {id !== 'overview' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BIOMARKER_COLORS[id] }} /> : null}
                <T v="small" style={{ color: sensorType === id ? colors.text : colors.textSecondary }}>{id === 'overview' ? 'All sensors' : BIOMARKERS[id].shortName}</T>
              </Pressable>)}
            </View>
            {mapView === '3d' ? (
              <View style={{ height: Math.max(360, H * 0.44) }}>
                <RetainerView key={arch} arch={arch} style={{ flex: 1 }} regions={regions} reveal selectedTooth={loupe} onSelect={onSelect} active={focused && loupe == null} />

              </View>
            ) : (
              <View style={{ paddingHorizontal: 6, paddingTop: space.sm, paddingBottom: space.md }}>
                <ArchDiagram marks={attentionMarks} key={arch} arch={arch} sites={strip?.sites.filter(site => sensorType === 'overview' || site.biomarker === sensorType)} references={strip?.sensorReferences.filter(site => sensorType === 'overview' || site.biomarker === sensorType)} selected={loupe} onSelect={openTooth} numbering={numbering} />
              </View>
            )}
            <View style={{ paddingBottom: space.md }}>
              <BiomarkerLegend only={[]} />
              <T v="small" style={{ textAlign: 'center', marginTop: space.sm, color: colors.textSecondary }}>Orange: watch · Red: needs attention · Tap a tooth</T>
            </View>
          </View>
        </Section>

        {/* Findings */}
        <Section title="Areas to review" action={<Pressable accessibilityRole="button" onPress={() => router.push('/trends')} style={{ minHeight: 44, justifyContent: 'center' }}><T v="small" style={{ color: colors.text }}>View all ›</T></Pressable>}>
          <View style={styles.list}>
            {!findings.length ? <T v="body" style={{ padding: space.lg }}>No flagged findings in the latest scan. Keep your usual routine.</T> : null}
            {findings.map((i, idx) => (
              <Pressable
                key={i.id}
                onPress={() => {
                  const site = i.siteIds.length ? analysis?.results.find((x) => x.site.id === i.siteIds[0]) : undefined;
                  if (site) openTooth(site.site.toothUniversal);
                  else if (i.action) router.push(i.action.href as never);
                }}
                style={({ pressed }) => [styles.listRow, idx > 0 && styles.listBorder, pressed && { backgroundColor: colors.surfaceRaised }]}>
                <View style={{ paddingTop: 7 }}>
                  <StatusDot status={i.status === 'info' ? 'unavailable' : i.status} size={6} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" style={{ fontSize: 15 }}>{i.title}</T>
                </View>
                <Icon name="chevron" size={14} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </Section>

        <Section title="Your next steps">
          <View style={styles.list}>
            {!recommendations.length ? <T v="body" style={{ padding: space.lg }}>Keep brushing twice daily with fluoride toothpaste and cleaning between your teeth.</T> : null}
            {(allRecommendations ? recommendations : recommendations.slice(0, 3)).map((r, idx) => {
              // Link each recommendation to the spot it is about (or to strip health).
              const ins = insights.find((i) => i.id === r.insightId);
              const site = ins?.siteIds.length ? analysis?.results.find((x) => x.site.id === ins.siteIds[0]) : undefined;
              const go = site
                ? () => openTooth(site.site.toothUniversal)
                : ins?.kind === 'strip'
                  ? () => router.push('/strip')
                  : undefined;
              return (
                <Pressable
                  key={r.id}
                  onPress={go}
                  disabled={!go}
                  style={({ pressed }) => [styles.listRow, idx > 0 && styles.listBorder, pressed && go && { backgroundColor: colors.surfaceRaised }]}
                  accessibilityLabel={site ? `${r.text}. Show tooth ${site.site.toothUniversal}` : r.text}
                >
                  <T v="small" style={{ width: 18, color: colors.textMuted, paddingTop: 1 }}>{idx + 1}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" style={{ fontSize: 15 }}>{r.text}</T>
                  </View>
                  {go ? <Icon name="chevron" size={14} color={colors.textMuted} /> : null}
                </Pressable>
              );
            })}
          </View>
          {recommendations.length > 3 ? <Button label={allRecommendations ? 'Show fewer steps' : `Show all ${recommendations.length} steps`} kind="ghost" onPress={() => setAllRecommendations(v => !v)} /> : null}
          <Pressable onPress={() => router.push('/about')} style={{ marginTop: space.lg }}>
            <T v="body" style={{ fontSize: 14 }}>About these readings ›</T>
          </Pressable>
        </Section>
      </Screen>

      <Loupe tooth={loupe} regions={regions} onClose={() => setLoupe(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.family, fontSize: 15, outlineStyle: 'none' } as object,
  result: { paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  mapCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  hint: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 5 },
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  listRow: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.lg, paddingVertical: 14, alignItems: 'flex-start' },
  listBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
