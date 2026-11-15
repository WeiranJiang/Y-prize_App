import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import ColumnChart from '../../components/charts/ColumnChart';
import LineChart, { LPoint } from '../../components/charts/LineChart';
import Sparkline from '../../components/charts/Sparkline';
import Icon from '../../components/Icon';
import { Card, DemoBadge, Screen, Section, Segmented, StatusDot, T, Tabs } from '../../components/ui';
import { persistentSites, siteSeries, siteTitle } from '../../domain/analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, classify, formatDelta, formatValue, STATUS_RANK, unitSuffix } from '../../domain/biomarkers';
import { usableFractionOf } from '../../domain/fouling';
import { toothByUniversal, toothNumber } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { STATUS_HEX } from '../../three/regions';
import { colors, space } from '../../theme/tokens';

type Range = '1' | '7' | '30' | '90';

const dayFmt = (x: number) => new Date(x).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const tipFmt = (x: number) => new Date(x).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function niceTicks(lo: number, hi: number, n = 5) {
  const span = hi - lo || 1;
  const raw = span / (n - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const start = Math.ceil(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export default function Trends() {
  const params = useLocalSearchParams<{ tooth?: string; bio?: string }>();
  const { state, strip, latestScan, arch, setArch } = useStore();
  const [range, setRange] = useState<Range>('30');
  const [bio, setBio] = useState<BiomarkerId>('pH');
  const [toothSel, setToothSel] = useState<number | null>(params.tooth ? Number(params.tooth) : null);
  const [pair, setPair] = useState(0);
  useEffect(() => {
    if (!params.tooth) return;
    const u = Number(params.tooth);
    if (toothByUniversal(u).arch !== arch) setArch(toothByUniversal(u).arch);
    setToothSel(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth]);
  useEffect(() => {
    if (params.bio && params.bio in BIOMARKERS) setBio(params.bio as BiomarkerId);
  }, [params.bio]);
  const selTooth = toothSel != null && toothByUniversal(toothSel).arch === arch ? toothSel : null;
  const b = BIOMARKERS[bio];
  const numbering = state.settings.numbering;
  const fmt = (v: number) => formatValue(b, v);

  const scans = useMemo(() => {
    const cutoff = Date.now() - Number(range) * 86400000;
    return state.scans.filter((s) => +new Date(s.at) >= cutoff).sort((a, z) => +new Date(a.at) - +new Date(z.at));
  }, [state.scans, range]);
  const archStripIds = new Set(state.strips.filter((s) => s.arch === arch).map((s) => s.id));
  const archScans = scans.filter((s) => archStripIds.has(s.stripId));

  const xDomain: [number, number] = scans.length ? [+new Date(scans[0].at), +new Date(scans[scans.length - 1].at)] : [0, 1];
  const xTicks = [xDomain[0], (xDomain[0] + xDomain[1]) / 2, xDomain[1]];
  const stripChanges = archScans
    .filter((s, i) => i > 0 && s.stripId !== archScans[i - 1].stripId)
    .map((s) => ({ x: +new Date(s.at), label: 'New strip' }));

  const archSites = strip.sites.filter((s) => s.biomarker === bio).sort((x, y) => x.toothUniversal - y.toothUniversal);
  const measureSites = archSites;

  const toPoints = (id: string): LPoint[] =>
    siteSeries(id, scans, bio).map((p) => ({
      x: +new Date(p.at),
      y: p.value,
      hollow: p.late || (p.value != null && p.quality < 0.35),
      note: p.late ? 'Read outside window' : p.value != null && p.quality < 0.35 ? 'Low signal quality' : undefined,
    }));

  // One y-scale per biomarker, fitted to the data and its thresholds.
  const allVals = measureSites.flatMap((s) => siteSeries(s.id, scans, bio).map((p) => p.value).filter((v): v is number => v != null));
  const lo0 = Math.min(...allVals, b.bands.high, b.bands.mild);
  const hi0 = Math.max(...allVals, b.bands.high, b.bands.mild);
  const padY = (hi0 - lo0) * 0.08;
  const yTicks = niceTicks(Math.max(0, lo0 - padY), hi0 + padY);
  const yDomain: [number, number] = [Math.min(yTicks[0], lo0 - padY), Math.max(yTicks[yTicks.length - 1], hi0 + padY)];
  const normalBand = b.bands.concern === 'low' ? { from: b.bands.mild, to: yDomain[1] } : { from: yDomain[0], to: b.bands.mild };
  const cmpWord = b.bands.concern === 'low' ? 'below' : 'above';

  const sitesSorted = measureSites
    .map((s) => {
      const series = siteSeries(s.id, scans, bio);
      const last = series[series.length - 1];
      return { s, series, last, status: classify(last?.value ?? null, b.bands) };
    })
    .sort((a, z) => STATUS_RANK[z.status] - STATUS_RANK[a.status]);

  const persistent = persistentSites(strip, scans).filter((p) => p.site.biomarker === bio);

  // Arch map coloured for the selected biomarker: concerning teeth take its colour.
  const marks = new Map<number, { color: string; dashed?: boolean }>();
  for (const x of sitesSorted) {
    if (marks.has(x.s.toothUniversal)) continue;
    marks.set(x.s.toothUniversal, x.status === 'unavailable' ? { color: colors.unavailable, dashed: true } : { color: STATUS_HEX[x.status] });
  }
  const toothSites = selTooth != null ? archSites.filter((s) => s.toothUniversal === selTooth) : [];
  const otherOnTooth = selTooth != null ? [...new Set(strip.sites.filter((s) => s.toothUniversal === selTooth && s.biomarker !== bio).map((s) => s.biomarker))] : [];

  // Neighbouring pairs along the arch, most concerning first.
  const pairs = archSites
    .slice(1)
    .map((s, i) => [archSites[i], s] as const)
    .map(([x, y]) => {
      const rank = (id: string) => STATUS_RANK[classify(siteSeries(id, scans, bio).pop()?.value ?? null, b.bands)];
      return { x, y, score: Math.max(rank(x.id), rank(y.id)) - Math.abs(x.toothUniversal - y.toothUniversal) * 0.05 };
    })
    .sort((p, q) => q.score - p.score)
    .slice(0, 3);
  const pr = pairs[Math.min(pair, Math.max(0, pairs.length - 1))];

  void STATUS_RANK;
  const changes = measureSites
    .map((s) => {
      const series = siteSeries(s.id, scans, bio).filter((p) => p.value != null);
      if (series.length < 2) return null;
      const last = series[series.length - 1];
      const weekAgo = series.find((p) => +new Date(p.at) >= +new Date(last.at) - 7 * 86400000) ?? series[0];
      return { s, delta: (last.value as number) - (weekAgo.value as number), comparable: last.calibrationVersion === weekAgo.calibrationVersion };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, z) => Math.abs(z.delta) - Math.abs(a.delta))
    .slice(0, 5);

  const bioOptions = BIOMARKER_ORDER.map((id) => ({
    key: id,
    label: BIOMARKERS[id].shortName,
    disabled: !strip.supported.includes(id),
  }));

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T v="display">Trends</T>
          <T v="small" style={{ marginTop: 2 }}>{archScans.length} scans in range · {arch} teeth</T>
        </View>
        <DemoBadge />
      </View>

      <View style={{ marginTop: space.lg, gap: 8 }}>
        <Segmented fill options={[{ key: '1', label: '1D' }, { key: '7', label: '7D' }, { key: '30', label: '30D' }, { key: '90', label: '90D' }]} value={range} onChange={setRange} />
        <Tabs options={bioOptions} value={bio} onChange={(k) => (strip.supported.includes(k) ? setBio(k) : null)} />
      </View>

      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
        <ArchToggle onChange={() => setToothSel(null)} />
      </View>

      <Section title="Tap a tooth">
        <Card style={{ paddingHorizontal: 6 }}>
          <ArchDiagram key={arch} arch={arch} marks={marks} selected={selTooth} onSelect={setToothSel} numbering={numbering} />
          <T v="small" style={{ textAlign: 'center', fontSize: 11 }}>Green: {b.shortName} in range · amber/red: needs a look</T>
        </Card>
      </Section>

      {selTooth != null ? (
        <Section>
          <T v="label">{toothNumber(toothByUniversal(selTooth), numbering)} · {b.name}</T>
          <T v="title" style={{ marginTop: 4 }}>{toothByUniversal(selTooth).name}</T>
          {toothSites.length === 0 ? (
            <Card style={{ marginTop: space.md }}>
              <T v="body">No {b.shortName} sensor on this tooth.</T>
              {otherOnTooth.length ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md }}>
                  {otherOnTooth.map((id) => (
                    <Pressable key={id} onPress={() => setBio(id)} style={styles.chip}>
                      <T v="small" style={{ color: colors.text }}>{BIOMARKERS[id].shortName}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </Card>
          ) : (
            <Card style={{ marginTop: space.md }}>
              {/* Now */}
              {toothSites.map((s, i) => {
                const last = siteSeries(s.id, scans, bio).pop();
                const st = classify(last?.value ?? null, b.bands);
                return (
                  <View key={s.id} style={[styles.nowRow, i > 0 && styles.rowBorder]}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st === 'unavailable' ? 'transparent' : STATUS_HEX[st], borderWidth: st === 'unavailable' ? 1 : 0, borderColor: colors.unavailable }} />
                    <T v="small" style={{ flex: 1, color: colors.text }} numberOfLines={1}>{siteTitle(s, numbering).surface}</T>
                    <T v="number" style={{ fontSize: 22 }}>{last?.value == null ? '—' : fmt(last.value)}<T v="small">{unitSuffix(b)}</T></T>
                    <T v="small" style={{ width: 104, textAlign: 'right', fontSize: 11 }} numberOfLines={2}>{st === 'unavailable' ? 'Not measured' : st === 'normal' ? 'In range' : b.statusWords[st]}</T>
                  </View>
                );
              })}
              {/* Trend */}
              <View style={{ marginTop: space.lg }}>
                {(() => {
                  const series = toothSites.slice(0, 2).map((s, i) => ({
                    id: s.id,
                    label: siteTitle(s, numbering).surface,
                    color: toothSites.length === 1 ? colors.text : [colors.seriesA, colors.seriesB][i],
                    points: toPoints(s.id),
                    markerColor: toothSites.length === 1 ? (p: LPoint) => STATUS_HEX[classify(p.y, b.bands)] : undefined,
                  }));
                  return (
                    <>
                      {series.length > 1 ? (
                        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 8 }}>
                          {series.map((x) => (
                            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <View style={{ width: 14, height: 2, backgroundColor: x.color }} />
                              <T v="small" style={{ fontSize: 11 }}>{x.label}</T>
                            </View>
                          ))}
                        </View>
                      ) : null}
                      <LineChart
                        series={series}
                        height={210}
                        yDomain={yDomain}
                        yTicks={yTicks}
                        formatY={fmt}
                        xDomain={xDomain}
                        xTicks={xTicks}
                        formatX={dayFmt}
                        formatTooltipX={tipFmt}
                        band={normalBand}
                        thresholds={[{ y: b.bands.elevated, label: `Threshold ${fmt(b.bands.elevated)}${unitSuffix(b)}` }]}
                        verticals={stripChanges}
                        endLabels={series.length > 1}
                      />
                    </>
                  );
                })()}
              </View>
              <T v="small" style={{ fontSize: 11, marginTop: space.sm }}>Shaded: normal range · coloured dots need attention · hollow: low quality</T>
            </Card>
          )}
        </Section>
      ) : null}

      <Section title={`All ${b.shortName} sites`}>
        <Card style={{ paddingVertical: 4 }}>
          {sitesSorted.map(({ s, series, last, status }, i) => {
            const t = siteTitle(s, numbering);
            return (
              <Pressable key={s.id} onPress={() => setToothSel(s.toothUniversal)} style={[styles.smRow, i > 0 && styles.rowBorder]}>
                <View style={{ width: 118 }}>
                  <T v="small" style={{ color: colors.text }} numberOfLines={1}>{t.number} {t.surface.toLowerCase()}</T>
                  <T v="small" style={{ fontSize: 11 }} numberOfLines={1}>{t.tooth.shortName}{s.role === 'comparison' ? ' · ref' : ''}</T>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 10 }}>
                  <Sparkline points={series.map((p) => p.value)} bands={b.bands} height={30} domain={yDomain} />
                </View>
                <View style={{ width: 54, alignItems: 'flex-end' }}>
                  <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'], color: last?.value == null ? colors.textSecondary : colors.text }}>{last?.value == null ? 'n/a' : formatValue(b, last.value)}</T>
                </View>
              </Pressable>
            );
          })}
        </Card>
      </Section>

      <Section title="Compare neighbouring sites">
        {pr ? (
          <>
            <Segmented
              style={{ paddingHorizontal: 0 }}
              options={pairs.map((p, i) => ({ key: String(i), label: `${siteTitle(p.x, numbering).number} ${siteTitle(p.x, numbering).surface.slice(0, 4).toLowerCase()} vs ${siteTitle(p.y, numbering).number} ${siteTitle(p.y, numbering).surface.slice(0, 4).toLowerCase()}` }))}
              value={String(Math.min(pair, pairs.length - 1))}
              onChange={(k) => setPair(Number(k))}
            />
            <Card style={{ marginTop: space.md }}>
              {(() => {
                const A = pr.x;
                const B = pr.y;
                const la = `${siteTitle(A, numbering).number} ${siteTitle(A, numbering).surface.toLowerCase()}`;
                const lb = `${siteTitle(B, numbering).number} ${siteTitle(B, numbering).surface.toLowerCase()}`;
                return (
                  <>
                    <View style={{ flexDirection: 'row', gap: 16 }}>
                      {[
                        { c: colors.seriesA, l: la },
                        { c: colors.seriesB, l: lb },
                      ].map((x) => (
                        <View key={x.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 14, height: 2, backgroundColor: x.c }} />
                          <T v="small" style={{ fontSize: 11 }}>{x.l}</T>
                        </View>
                      ))}
                    </View>
                    <View style={{ marginTop: space.md }}>
                      <LineChart
                        series={[
                          { id: A.id, label: siteTitle(A, numbering).number, color: colors.seriesA, points: toPoints(A.id) },
                          { id: B.id, label: siteTitle(B, numbering).number, color: colors.seriesB, points: toPoints(B.id) },
                        ]}
                        height={200}
                        yDomain={yDomain}
                        yTicks={yTicks}
                        formatY={fmt}
                        xDomain={xDomain}
                        xTicks={xTicks}
                        formatX={dayFmt}
                        formatTooltipX={tipFmt}
                        thresholds={[{ y: b.bands.elevated, label: fmt(b.bands.elevated) }]}
                        verticals={stripChanges}
                        endLabels
                      />
                    </View>
                    <T v="small" style={{ marginTop: space.sm }}>Neighbouring sites share the same saliva and routine, so a widening gap between them points to a local difference rather than a whole-mouth change.</T>
                  </>
                );
              })()}
            </Card>
          </>
        ) : (
          <T v="body">Needs two {b.shortName} sites on this arch.</T>
        )}
      </Section>

      <Section title="Consistently elevated sites">
        <Card style={{ paddingVertical: 4 }}>
          {persistent.length === 0 ? (
            <T v="body" style={{ paddingVertical: space.md }}>No site has repeatedly crossed the research threshold.</T>
          ) : (
            persistent.map((p, i) => {
              const t = siteTitle(p.site, numbering);
              return (
                <Pressable key={p.site.id} onPress={() => setToothSel(p.site.toothUniversal)} style={[styles.smRow, i > 0 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" style={{ fontSize: 14 }}>{t.tooth.name}</T>
                    <T v="small">{t.surface} · {cmpWord} {b.shortName} {fmt(b.bands.elevated)}{unitSuffix(b)} in {p.below} of last {p.valid} valid scans</T>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {Array.from({ length: p.valid }).map((_, k) => (
                      <View key={k} style={{ width: 6, height: 16, borderRadius: 2, backgroundColor: k >= p.valid - p.below ? colors.high : colors.surfaceRaised }} />
                    ))}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </Section>

      <Section title="Measurement reliability">
        <Card>
          <T v="small">Share of {arch}-strip sites that returned a usable reading at each scan. Falls as film builds on a strip; recovers after replacement.</T>
          <View style={{ marginTop: space.md }}>
            <ColumnChart
              cols={archScans.map((s, i) => {
                const u = usableFractionOf(s);
                const late = s.readoutDelayMin > s.readoutWindowMin;
                return {
                  key: s.id,
                  value: u,
                  color: u < state.settings.limits.usableMin ? colors.high : late ? colors.mild : '#3A3A3A',
                  label: i === 0 || i === archScans.length - 1 || (i > 0 && s.stripId !== archScans[i - 1].stripId) ? dayFmt(+new Date(s.at)) : undefined,
                  tooltip: `${tipFmt(+new Date(s.at))}\n${Math.round(u * 100)}% usable${late ? ' · read late' : ''}`,
                };
              })}
              threshold={{ y: state.settings.limits.usableMin, label: `min ${Math.round(state.settings.limits.usableMin * 100)}%` }}
            />
          </View>
          <Pressable onPress={() => router.push('/strip')} style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: 6 }}>
            <T v="small" style={{ color: colors.text }}>Strip health and replacement forecast</T>
            <Icon name="chevron" size={14} color={colors.textMuted} />
          </Pressable>
        </Card>
      </Section>

      <Section title="Before & after">
        <Card onPress={() => router.push('/compare')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="compare" size={22} color={colors.textSecondary} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">Compare two scans in 3D</T>
              <T v="small">Same camera, colour scale and registration{latestScan ? ` · latest ${dayFmt(+new Date(latestScan.at))}` : ''}</T>
            </View>
            <Icon name="chevron" size={16} color={colors.textMuted} />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  smRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 30, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
});

