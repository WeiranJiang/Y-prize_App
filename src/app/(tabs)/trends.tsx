import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ColumnChart from '../../components/charts/ColumnChart';
import LineChart, { LPoint } from '../../components/charts/LineChart';
import Sparkline from '../../components/charts/Sparkline';
import Icon from '../../components/Icon';
import { Card, DemoBadge, Screen, Section, Segmented, StatusDot, T } from '../../components/ui';
import { persistentSites, siteSeries, siteTitle } from '../../domain/analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, classify, formatDelta, formatValue, STATUS_RANK, unitSuffix } from '../../domain/biomarkers';
import { usableFractionOf } from '../../domain/fouling';
import { useStore } from '../../state/store';
import { colors, space } from '../../theme/tokens';

type Range = '7' | '30' | '90' | 'all';
type Loc = 'mouth' | 'upper' | 'lower' | 'tooth' | 'site';

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
  const { state, strip, stripFor, latestScan, arch, setArch } = useStore();
  const [range, setRange] = useState<Range>('30');
  const [bio, setBio] = useState<BiomarkerId>('pH');
  const [loc, setLoc] = useState<Loc>('mouth');
  const [siteId, setSiteId] = useState('S01');
  const [toothU, setToothU] = useState(3);
  const [pair, setPair] = useState(0);
  const b = BIOMARKERS[bio];
  const numbering = state.settings.numbering;
  const fmt = (v: number) => formatValue(b, v);

  const scans = useMemo(() => {
    const cutoff = range === 'all' ? 0 : Date.now() - Number(range) * 86400000;
    return state.scans.filter((s) => +new Date(s.at) >= cutoff).sort((a, z) => +new Date(a.at) - +new Date(z.at));
  }, [state.scans, range]);
  const archStripIds = new Set(state.strips.filter((s) => s.arch === arch).map((s) => s.id));
  const archScans = scans.filter((s) => archStripIds.has(s.stripId));

  const xDomain: [number, number] = scans.length ? [+new Date(scans[0].at), +new Date(scans[scans.length - 1].at)] : [0, 1];
  const xTicks = [xDomain[0], (xDomain[0] + xDomain[1]) / 2, xDomain[1]];
  const stripChanges = archScans
    .filter((s, i) => i > 0 && s.stripId !== archScans[i - 1].stripId)
    .map((s) => ({ x: +new Date(s.at), label: 'New strip' }));

  const strips = loc === 'mouth' ? [stripFor('upper'), stripFor('lower')] : [strip];
  const measureSites = strips.flatMap((st) => st.sites.filter((s) => s.biomarker === bio));
  const archSites = strip.sites.filter((s) => s.biomarker === bio).sort((x, y) => x.toothUniversal - y.toothUniversal);
  const sid = archSites.find((s) => s.id === siteId) ? siteId : archSites[0]?.id;
  const teeth = [...new Set(archSites.map((s) => s.toothUniversal))];
  const tu = teeth.includes(toothU) ? toothU : teeth[0];

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

  const persistent = strips.flatMap((st) => persistentSites(st, scans)).filter((p) => p.site.biomarker === bio);

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
      <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T v="display" style={{ fontSize: 30 }}>Trends</T>
          <T v="small" style={{ marginTop: 2 }}>{archScans.length} scans in range · {arch} teeth</T>
        </View>
        <DemoBadge />
      </View>

      <View style={{ marginTop: space.lg, gap: 8 }}>
        <Segmented options={[{ key: '7', label: '7 days' }, { key: '30', label: '30 days' }, { key: '90', label: '90 days' }, { key: 'all', label: 'All time' }]} value={range} onChange={setRange} />
        <Segmented options={bioOptions} value={bio} onChange={(k) => (strip.supported.includes(k) ? setBio(k) : null)} />
        <Segmented
          options={[
            { key: 'mouth', label: 'Entire mouth' },
            { key: 'upper', label: 'Upper arch' },
            { key: 'lower', label: 'Lower arch' },
            { key: 'tooth', label: `Tooth · ${arch}` },
            { key: 'site', label: `Surface · ${arch}` },
          ]}
          value={loc === 'upper' || loc === 'lower' ? arch : loc}
          onChange={(k) => {
            if (k === 'upper' || k === 'lower') setArch(k);
            setLoc(k);
          }}
        />
      </View>

      {(loc === 'tooth' || loc === 'site') && (
        <View style={{ marginTop: 8 }}>
          {loc === 'tooth' ? (
            <Segmented
              options={teeth.map((u) => ({ key: String(u), label: siteTitle(archSites.find((s) => s.toothUniversal === u)!, numbering).number }))}
              value={String(tu)}
              onChange={(k) => setToothU(Number(k))}
            />
          ) : (
            <Segmented
              options={archSites.map((s) => {
                const t = siteTitle(s, numbering);
                return { key: s.id, label: `${t.number} ${t.surface.toLowerCase()}` };
              })}
              value={sid}
              onChange={setSiteId}
            />
          )}
        </View>
      )}

      <Section title={`${b.name} over time`}>
        {loc === 'mouth' || loc === 'upper' ? (
          <Card style={{ paddingVertical: 4 }}>
            <T v="small" style={{ paddingVertical: space.md }}>Each monitored site is shown separately; locations are never averaged together.</T>
            {sitesSorted.map(({ s, series, last, status }, i) => {
              const t = siteTitle(s, numbering);
              return (
                <Pressable key={s.id} onPress={() => { setSiteId(s.id); setLoc('site'); }} style={[styles.smRow, i > 0 && styles.rowBorder]}>
                  <View style={{ width: 118 }}>
                    <T v="small" style={{ color: colors.text }} numberOfLines={1}>{t.number} {t.surface.toLowerCase()}</T>
                    <T v="small" style={{ fontSize: 11 }} numberOfLines={1}>{t.tooth.shortName}{s.role === 'comparison' ? ' · ref' : ''}</T>
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 10 }}>
                    <Sparkline accent={b.color} points={series.map((p) => p.value)} bands={b.bands} height={30} domain={yDomain} />
                  </View>
                  <View style={{ width: 54, alignItems: 'flex-end' }}>
                    <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'], color: last?.value == null ? colors.textSecondary : colors.text }}>{last?.value == null ? 'n/a' : formatValue(b, last.value)}</T>
                    <StatusDot status={status} size={6} />
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Card>
            {(() => {
              const ids = loc === 'site' ? (sid ? [sid] : []) : archSites.filter((s) => s.toothUniversal === tu).map((s) => s.id);
              const palette = [colors.seriesA, colors.seriesB];
              const series = ids.slice(0, 2).map((id, i) => {
                const s = strip.sites.find((x) => x.id === id)!;
                return {
                  id,
                  label: siteTitle(s, numbering).surface,
                  color: ids.length === 1 ? colors.text : palette[i],
                  points: toPoints(id),
                  markerColor: ids.length === 1 ? (p: LPoint) => (classify(p.y, b.bands) === 'normal' ? colors.point : b.color) : undefined,
                };
              });
              const s0 = strip.sites.find((x) => x.id === ids[0]);
              return (
                <>
                  <T v="bodyStrong">{s0 ? `${siteTitle(s0, numbering).tooth.name}${loc === 'site' ? ` · ${siteTitle(s0, numbering).surface}` : ''}` : ''}</T>
                  {series.length > 1 ? (
                    <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
                      {series.map((s) => (
                        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 14, height: 2, backgroundColor: s.color }} />
                          <T v="small" style={{ fontSize: 11 }}>{s.label}</T>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={{ marginTop: space.md }}>
                    <LineChart
                      series={series}
                      height={220}
                      yDomain={yDomain}
                      yTicks={yTicks}
                      formatY={fmt}
                      xDomain={xDomain}
                      xTicks={xTicks}
                      formatX={dayFmt}
                      formatTooltipX={tipFmt}
                      band={normalBand}
                      thresholds={[{ y: b.bands.elevated, label: `Research threshold ${fmt(b.bands.elevated)}${unitSuffix(b)}` }]}
                      verticals={stripChanges}
                      endLabels={series.length > 1}
                    />
                  </View>
                  <T v="small" style={{ fontSize: 11, marginTop: space.sm }}>
                    Shaded: configured normal range. Coloured markers need attention. Hollow markers: low quality or read late. Ticks on the baseline: no usable reading.
                  </T>
                </>
              );
            })()}
          </Card>
        )}
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
                <Pressable key={p.site.id} onPress={() => router.navigate({ pathname: '/explore', params: { tooth: String(p.site.toothUniversal), site: p.site.id } })} style={[styles.smRow, i > 0 && styles.rowBorder]}>
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" style={{ fontSize: 14 }}>{t.tooth.name}</T>
                    <T v="small">{t.surface} · {cmpWord} {b.shortName} {fmt(b.bands.elevated)}{unitSuffix(b)} in {p.below} of last {p.valid} valid scans</T>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {Array.from({ length: p.valid }).map((_, k) => (
                      <View key={k} style={{ width: 6, height: 16, borderRadius: 2, backgroundColor: k >= p.valid - p.below ? b.color : colors.hairlineStrong }} />
                    ))}
                  </View>
                </Pressable>
              );
            })
          )}
        </Card>
      </Section>

      <Section title="Recent change" action={<T v="small">vs. ~7 days earlier</T>}>
        <Card style={{ paddingVertical: 4 }}>
          {changes.map((c, i) => {
            const t = siteTitle(c.s, numbering);
            return (
              <View key={c.s.id} style={[styles.smRow, i > 0 && styles.rowBorder]}>
                <View style={{ flex: 1 }}>
                  <T v="small" style={{ color: colors.text }}>{t.number} {t.surface.toLowerCase()}</T>
                  {!c.comparable ? <T v="small" style={{ fontSize: 11 }}>Different strip calibration: not directly comparable</T> : null}
                </View>
                <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{formatDelta(b, c.delta)}</T>
              </View>
            );
          })}
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
                  color: u < state.settings.limits.usableMin ? colors.elevated : late ? colors.mild : colors.normal,
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
});

