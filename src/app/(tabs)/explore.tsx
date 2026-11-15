import { useIsFocused, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, TextInput, View } from 'react-native';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import BiomarkerLegend from '../../components/BiomarkerLegend';
import BottomSheet from '../../components/BottomSheet';
import Sparkline from '../../components/charts/Sparkline';
import FloatingLabel from '../../components/FloatingLabel';
import Icon from '../../components/Icon';
import { OIR } from '../../components/SiteDetail';
import { Card, DemoBadge, Divider, IconButton, KV, Screen, Section, Segmented, StatusTag, T } from '../../components/ui';
import { siteAnchor } from '../../domain/arch';
import { confidenceOf, readingStatus, siteSeries, siteTitle, SiteResult, surfaceLabel } from '../../domain/analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, formatDelta, formatValue, STATUS_RANK, unitSuffix } from '../../domain/biomarkers';
import { RETAINER_TEETH, searchTeeth, Tooth, toothByUniversal, toothNumber } from '../../domain/teeth';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { regionsForScan, ViewMode } from '../../three/regions';
import { colors, font, radius, space } from '../../theme/tokens';

/** Deterministic per-transmitter split of a site reading (research view). */
function transmitterRows(r: SiteResult) {
  return r.site.transmitters.map((id, i) => {
    const k = [0.012, -0.018, 0.006][i % 3];
    const value = r.reading.value != null ? r.reading.value + k * 3 : null;
    return {
      id,
      raw: (r.reading.rawRatio * (1 + k)).toFixed(3),
      counts: Math.round(r.reading.rawCounts * (1 + k * 2)),
      value,
      snr: (r.reading.snr * (1 - Math.abs(k) * 2)).toFixed(1),
    };
  });
}

export default function Explore() {
  const params = useLocalSearchParams<{ tooth?: string; site?: string }>();
  const { latestScan, stripById, analysis, insights, state, dispatch, arch, setArch } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const [mode, setMode] = useState<ViewMode>('overview');
  const [tooth, setTooth] = useState<number | null>(params.tooth ? Number(params.tooth) : null);
  const [siteId, setSiteId] = useState<string | null>(params.site ?? null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [info, setInfo] = useState<BiomarkerId | null>(null);
  const [reset, setReset] = useState(0);
  const labelPos = useRef(new Animated.ValueXY({ x: -500, y: -500 })).current;
  const numbering = state.settings.numbering;
  const research = state.settings.view === 'research';

  useEffect(() => {
    if (params.tooth) {
      const u = Number(params.tooth);
      setTooth(u);
      const a = toothByUniversal(u).arch;
      if (a !== arch) setArch(a);
    }
    setSiteId(params.site ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth, params.site]);

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

  const onSelect = (s: Selection | null) => {
    setTooth(s?.tooth ?? null);
    setSiteId(s?.siteId ?? null);
  };

  const t: Tooth | null = tooth ? toothByUniversal(tooth) : null;
  const toothSites = analysis?.results.filter((r) => r.site.toothUniversal === tooth) ?? [];
  const covered = !!t && RETAINER_TEETH.some((x) => x.universal === t.universal) && t.arch === arch;
  const toothInsights = insights.filter((i) => i.siteIds.some((id) => toothSites.find((r) => r.site.id === id)));
  const selSite = siteId ? analysis?.results.find((r) => r.site.id === siteId) : undefined;
  const results = query ? searchTeeth(query, numbering).slice(0, 6) : [];

  const modeOptions: { key: ViewMode; label: string; disabled?: boolean; badge?: string }[] = [
    { key: 'overview' as ViewMode, label: 'Overview' },
    ...BIOMARKER_ORDER.map((id) => {
      const b = BIOMARKERS[id];
      const supported = !!strip?.supported.includes(id);
      return { key: id as ViewMode, label: b.shortName, disabled: !supported, badge: supported ? undefined : b.support === 'research' ? 'Research' : 'Planned' };
    }),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <T v="display" style={{ fontSize: 30 }}>Explore</T>
            <View style={{ marginTop: space.md }}>
              <ArchToggle onChange={() => onSelect(null)} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <IconButton name="search" onPress={() => setSearching((v) => !v)} />
            <IconButton name="refresh" onPress={() => { onSelect(null); setReset((x) => x + 1); }} />
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
                placeholder="Tooth number, e.g. 3, 16, or “upper left molar”"
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
              />
            </View>
            {results.map((r) => (
              <Pressable
                key={r.universal}
                onPress={() => { if (r.arch !== arch) setArch(r.arch); setTooth(r.universal); setSiteId(null); setSearching(false); setQuery(''); }}
                style={{ paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <T v="bodyStrong" style={{ fontSize: 14 }}>{r.name}</T>
                <T v="small">#{r.universal} · FDI {r.fdi}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ marginTop: space.lg }}>
          <Segmented
            options={modeOptions}
            value={mode}
            onChange={(k) => {
              const opt = modeOptions.find((o) => o.key === k);
              if (opt?.disabled) setInfo(k as BiomarkerId);
              else setMode(k);
            }}
          />
        </View>

        <View style={{ height: Math.max(300, Dimensions.get('window').height * 0.42) }}>
          <RetainerView
            key={arch}
            arch={arch}
            style={{ flex: 1 }}
            regions={regions}
            selectedTooth={tooth}
            selectedSiteId={siteId}
            focusTooth={covered ? tooth : null}
            onSelect={onSelect}
            labelPos={labelPos}
            resetSignal={reset}
            active={focused}
          />
          {selSite ? (
            <FloatingLabel
              pos={labelPos}
              title={`${toothNumber(selSite.tooth, numbering)} · ${surfaceLabel(selSite.tooth, selSite.site.surface)}`}
              value={selSite.reading.value != null ? `${BIOMARKERS[selSite.site.biomarker].shortName} ${formatValue(BIOMARKERS[selSite.site.biomarker], selSite.reading.value)} ${BIOMARKERS[selSite.site.biomarker].unit === 'pH' ? '' : BIOMARKERS[selSite.site.biomarker].unit}` : 'Not measured'}
              status={selSite.status}
            />
          ) : null}
          {latestScan?.demo ? <DemoBadge style={{ position: 'absolute', left: space.xl, top: space.sm }} /> : null}
        </View>
        <BiomarkerLegend mode={mode === 'signal' ? 'overview' : mode} only={mode === 'overview' ? concernBiomarkers : undefined} />

        <Section title="Dental arch" action={<T v="small">{arch === 'upper' ? 'Upper' : 'Lower'} retainer · {numbering === 'universal' ? 'Universal' : 'FDI'}</T>}>
          <Card style={{ paddingHorizontal: 6 }}>
            <ArchDiagram key={arch} arch={arch} marks={marks} selected={tooth} onSelect={(u) => { setTooth(u); setSiteId(null); }} numbering={numbering} />
            <T v="small" style={{ textAlign: 'center', fontSize: 11 }}>Coloured teeth have a reading that needs attention. Dashed: a reading was withheld.</T>
          </Card>
        </Section>

        {t ? (
          <Section>
            <T v="label">{toothNumber(t, numbering)} · {numbering === 'universal' ? `FDI ${t.fdi}` : `Universal #${t.universal}`}</T>
            <T v="title" style={{ marginTop: 6 }}>{t.name}</T>
            {!covered ? (
              <T v="body" style={{ marginTop: space.md }}>{t.arch !== arch ? `This tooth is on your ${t.arch} arch. Switch to ${t.arch === 'upper' ? 'Upper' : 'Lower'} teeth to see it.` : 'This tooth is not covered by your retainer strip, so there are no measurements here.'}</T>
            ) : toothSites.length === 0 ? (
              <T v="body" style={{ marginTop: space.md }}>Covered by your retainer, but no sensing site is configured on this tooth. Neighbouring readings are not extrapolated here.</T>
            ) : (
              <>
                <T v="body" style={{ marginTop: 4 }}>
                  Measured: {toothSites.map((r) => `${surfaceLabel(t, r.site.surface)} ${BIOMARKERS[r.site.biomarker].shortName}`).join(' · ')}
                </T>
                {toothSites.map((r) => (
                  <SiteCard key={r.site.id} r={r} selected={siteId === r.site.id} onPress={() => setSiteId(siteId === r.site.id ? null : r.site.id)} research={research} />
                ))}
                {toothInsights.map((i) => (
                  <Card key={i.id} style={{ marginTop: space.md }}>
                    <T v="label" style={{ fontSize: 10 }}>{i.rule}</T>
                    <T v="bodyStrong" style={{ marginTop: 6 }}>{i.title}</T>
                    <OIR observed={i.observed} interpreted={i.interpreted} recommended={i.recommended} />
                    <T v="small" style={{ marginTop: space.md, fontSize: 11 }}>{i.criterion} Confidence: {i.confidence.toLowerCase()}.</T>
                  </Card>
                ))}
              </>
            )}
          </Section>
        ) : (
          <Section>
            <T v="body">Select a tooth to see each measured location, its trend and what it means.</T>
          </Section>
        )}

        <Section title="Detail level">
          <Card style={{ paddingVertical: 6 }}>
            <Pressable style={styles.toggleRow} onPress={() => dispatch({ type: 'settings', patch: { view: research ? 'consumer' : 'research' } })}>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" style={{ fontSize: 14 }}>Research view</T>
                <T v="small">Show individual transmitters, raw optical response, calibration and coordinates.</T>
              </View>
              <View style={[styles.switch, research && { backgroundColor: colors.ivory }]}>
                <View style={[styles.knob, research && { alignSelf: 'flex-end', backgroundColor: colors.textOnLight }]} />
              </View>
            </Pressable>
          </Card>
          <T v="small" style={{ marginTop: space.md, color: colors.textMuted }}>{BIOMARKERS.pH.limitation}</T>
        </Section>
      </Screen>

      <BottomSheet open={!!info} onClose={() => setInfo(null)}>
        {info ? (
          <View>
            <T v="label">{BIOMARKERS[info].support === 'research' ? 'In research' : 'Planned'}</T>
            <T v="title" style={{ marginTop: 6 }}>{BIOMARKERS[info].name}</T>
            <T v="body" style={{ marginTop: space.md }}>{BIOMARKERS[info].what}</T>
            <T v="body" style={{ marginTop: space.md, color: colors.text }}>Your connected strip ({strip?.batch}) measures pH only, so this map is not available.</T>
            <T v="small" style={{ marginTop: space.md }}>The app is built to add this biomarker once a strip that measures it has been validated. Nothing is estimated in the meantime.</T>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function SiteCard({ r, selected, onPress, research }: { r: SiteResult; selected: boolean; onPress: () => void; research: boolean }) {
  const { state, latestScan, stripById } = useStore();
  const b = BIOMARKERS[r.site.biomarker];
  const st = readingStatus(r.reading);
  const series = siteSeries(r.site.id, state.scans).slice(-10);
  const t = siteTitle(r.site, state.settings.numbering);
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const anchor = siteAnchor(r.site.toothUniversal, r.site.surface, r.site.offset).p;
  return (
    <Card onPress={onPress} style={[{ marginTop: space.md }, selected && { borderColor: colors.textSecondary }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="bodyStrong">{t.surface} {r.site.role === 'comparison' ? '· comparison' : 'site'}</T>
        <StatusTag status={st} label={st === 'unavailable' ? 'Unmeasured' : b.statusWords[st]} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: space.md }}>
        <View style={{ flex: 1 }}>
          <T v="small">{b.name}</T>
          <T v="number" style={{ fontSize: 34 }}>
            {formatValue(b, r.reading.value)}
            {r.reading.value != null ? <T v="small">  ± {formatValue(b, r.reading.uncertainty)}{unitSuffix(b)}</T> : null}
          </T>
        </View>
        <View style={{ width: 120 }}>
          <Sparkline accent={b.color} points={series.map((p) => p.value)} bands={b.bands} height={40} />
        </View>
      </View>
      <Divider style={{ marginVertical: space.md }} />
      <KV k="Previous scan" v={r.previous ? `${formatValue(b, r.previous.value)}${r.previous.comparable ? '' : ' (other calibration)'}` : '—'} />
      <KV k="Change" v={r.change != null ? `${formatDelta(b, r.change)}${unitSuffix(b)}` : '—'} />
      <KV k="Quality" v={r.reading.value == null ? 'Withheld (below floor)' : `${confidenceOf(r.reading.quality)} · ${(r.reading.quality * 100).toFixed(0)}`} />
      <KV k="Calibration" v={r.reading.calibration === 'ok' ? 'Calibrated' : 'Recalibration recommended'} />
      <KV k="Read" v={latestScan ? new Date(latestScan.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'} />
      <KV k="Sensor" v={r.site.id} mono />
      {r.reading.note ? <T v="small" style={{ marginTop: space.sm }}>{r.reading.note}</T> : null}

      {research ? (
        <View style={{ marginTop: space.md }}>
          <T v="label" style={{ fontSize: 10 }}>Research data</T>
          <KV k="Strip batch" v={strip?.batch ?? '—'} mono />
          <KV k="Tooth / surface" v={`U${r.site.toothUniversal} · FDI ${r.tooth.fdi} / ${r.site.surface}`} mono />
          <KV k="Coordinates (mm)" v={anchor.map((x) => x.toFixed(1)).join(', ')} mono />
          <KV k="Raw ratio · counts" v={`${r.reading.rawRatio.toFixed(3)} · ${r.reading.rawCounts}`} mono />
          <KV k="Calibrated" v={r.reading.value != null ? `${r.reading.value.toFixed(2)} ${b.unit}` : 'null'} mono />
          <KV k="Calibration version" v={latestScan?.calibrationVersion ?? '—'} mono />
          <KV k="SNR · transmission" v={`${r.reading.snr.toFixed(1)} · ${(r.reading.transmission * 100).toFixed(1)}%`} mono />
          <KV k="Drift estimate" v={`${r.reading.drift.toFixed(3)} ${b.unit}`} mono />
          <KV k="Sensor health" v={r.reading.health} mono />
          <View style={{ marginTop: space.sm, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong }}>
            {transmitterRows(r).map((x, i) => (
              <View key={x.id} style={{ flexDirection: 'row', padding: 8, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: colors.hairline }}>
                <T v="small" style={{ flex: 1.6, fontSize: 10.5, fontFamily: font.medium }}>{x.id}</T>
                <T v="small" style={{ flex: 1, fontSize: 10.5 }}>{x.raw}</T>
                <T v="small" style={{ flex: 1, fontSize: 10.5 }}>{x.value != null ? x.value.toFixed(2) : '—'}</T>
                <T v="small" style={{ flex: 0.8, fontSize: 10.5, textAlign: 'right' }}>SNR {x.snr}</T>
              </View>
            ))}
          </View>
          <T v="small" style={{ fontSize: 10.5, marginTop: 4 }}>Transmitter-level values are simulated in demo mode.</T>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 44, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 14, outlineStyle: 'none' } as object,
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  switch: { width: 44, height: 26, borderRadius: 13, backgroundColor: 'rgba(155,165,184,0.25)', padding: 3, justifyContent: 'center' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text },
});

