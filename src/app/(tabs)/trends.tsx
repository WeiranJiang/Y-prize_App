/**
 * Findings: pick biomarkers and drag a time range; the arch map, findings
 * list and tooth charts all follow the selected window.
 */
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Disclosure from '../../components/Disclosure';
import ArchDiagram from '../../components/ArchDiagram';
import ArchToggle from '../../components/ArchToggle';
import LineChart, { LPoint } from '../../components/charts/LineChart';
import Icon from '../../components/Icon';
import RangeSlider from '../../components/RangeSlider';
import { Button, Legend, Meta, Screen, Section, StatusDot, StatusTag, T } from '../../components/ui';
import { analyzeScan, siteSeries, siteTitle } from '../../domain/analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, classify, formatDelta, formatValue, Status, STATUS_RANK, unitSuffix } from '../../domain/biomarkers';
import { parseTooth, toothByUniversal, toothNumber } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { STATUS_HEX } from '../../three/regions';
import { colors, radius, space } from '../../theme/tokens';

const fmtDay = (iso: string | number) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function niceTicks(lo: number, hi: number, n = 4) {
  const span = hi - lo || 1;
  const raw = span / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

export default function Findings() {
  const params = useLocalSearchParams<{ tooth?: string; bio?: string }>();
  const { state, arch, setArch, stripById } = useStore();
  const numbering = state.settings.numbering;
  const [bios, setBios] = useState<BiomarkerId[]>(['pH', 'lactate', 'calcium']);
  const [showAll, setShowAll] = useState(false);
  const [tooth, setTooth] = useState<number | null>(parseTooth(params.tooth));

  const scans = useMemo(
    () => state.scans.filter((s) => stripById(s.stripId)?.arch === arch).sort((a, b) => +new Date(a.at) - +new Date(b.at)),
    [state.scans, arch, stripById],
  );
  const last = scans.length - 1;
  const defaultStart = Math.max(0, scans.findIndex((s) => +new Date(s.at) >= Date.now() - 14 * 86400000));
  const [range, setRange] = useState<[number, number]>([defaultStart, last]);
  useEffect(() => setRange([defaultStart, last]), [arch, last, defaultStart]);

  useEffect(() => {
    const u = parseTooth(params.tooth);
    if (u == null) return;
    if (toothByUniversal(u).arch !== arch) setArch(toothByUniversal(u).arch);
    setTooth(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.tooth]);
  useEffect(() => {
    if (typeof params.bio === 'string' && Object.prototype.hasOwnProperty.call(BIOMARKERS, params.bio)) setBios([params.bio as BiomarkerId]);
  }, [params.bio]);

  const i0 = Math.max(0, Math.min(range[0], last));
  const i1 = Math.max(0, Math.min(range[1], last));
  const win = scans.slice(i0, i1 + 1);
  const startScan = scans[i0];
  const endScan = scans[i1];
  const endStrip = endScan ? stripById(endScan.stripId) : undefined;
  const breaks = scans.map((s, i) => (i > 0 && s.stripId !== scans[i - 1].stripId ? i : -1)).filter((i) => i > 0);

  // State at the end of the window drives the map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endAnalysis = useMemo(() => (endScan && endStrip ? analyzeScan(endScan, endStrip, []) : undefined), [endScan, endStrip, state.rev]);
  const marks = useMemo(() => {
    const m = new Map<number, { rank: number; color: string; dashed?: boolean }>();
    endAnalysis?.results.forEach((r) => {
      if (!bios.includes(r.site.biomarker)) return;
      const rank = STATUS_RANK[r.status];
      const prev = m.get(r.site.toothUniversal);
      if (!prev || rank > prev.rank) m.set(r.site.toothUniversal, { rank, color: STATUS_HEX[r.status], dashed: r.status === 'unavailable' });
    });
    return m;
  }, [endAnalysis, bios]);

  // Findings within the window: any site that crossed a threshold for the chosen biomarkers.
  const sites = endStrip ? endStrip.sites.filter((s) => bios.includes(s.biomarker)) : [];
  const findings = sites
    .map((s) => {
      const b = BIOMARKERS[s.biomarker];
      const valid = siteSeries(s.id, win, s.biomarker).filter((p) => p.value != null);
      const statuses = valid.map((p) => classify(p.value, b.bands));
      const worst = statuses.reduce<Status>((w, x) => (STATUS_RANK[x] > STATUS_RANK[w] ? x : w), 'normal');
      const flagged = statuses.filter((x) => STATUS_RANK[x] >= 1).length;
      const first = valid[0]?.value ?? null;
      const end = valid[valid.length - 1]?.value ?? null;
      return { s, b, worst, flagged, total: valid.length, delta: first != null && end != null ? end - first : null, end };
    })
    .filter((f) => f.flagged > 0)
    .sort((x, y) => STATUS_RANK[y.worst] - STATUS_RANK[x.worst] || y.flagged - x.flagged);

  useEffect(() => setShowAll(false), [arch, bios, range]);

  const toggle = (id: BiomarkerId) =>
    setBios((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : BIOMARKER_ORDER.filter((x) => x === id || cur.includes(x))));

  const x0 = win.length ? +new Date(win[0].at) : 0;
  const x1 = win.length ? +new Date(win[win.length - 1].at) : 1;
  const xd: [number, number] = x1 - x0 < 3600000 ? [x0 - 6 * 3600000, x1 + 6 * 3600000] : [x0, x1];
  const selTooth = tooth != null && toothByUniversal(tooth).arch === arch ? tooth : null;

  const measuredBios = bios.filter(id => endStrip?.sites.some(site => site.toothUniversal === selTooth && site.biomarker === id));

  return (
    <Screen>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <T v="display">Findings</T>
        </View>

      </View>

      <T v="small" style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>Review flagged readings, then tap a tooth to see its history.</T>
      <View style={{ marginHorizontal: space.lg, marginTop: space.md }}>
      <T v="bodyStrong" style={{ fontSize: 15 }}>Measurements</T>
      {/* Biomarker multi-select */}
      <View style={styles.chips}>
        {BIOMARKER_ORDER.map((id) => {
          const on = bios.includes(id);
          return (
            <Pressable key={id} onPress={() => toggle(id)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              {on ? <Icon name="check" size={12} color={colors.text} strokeWidth={2} /> : null}
              <T v="small" style={{ color: on ? colors.text : colors.textSecondary, fontSize: 13, fontWeight: '500' }}>{BIOMARKERS[id].shortName}</T>
            </Pressable>
          );
        })}
      </View>

      <Meta style={{ marginTop: space.sm }}>Choose one or more measurements. At least one stays selected.</Meta>
      </View>
      {/* Time range */}
      <View style={styles.rangeBox}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
            {startScan ? fmtDay(startScan.at) : '—'} – {endScan ? fmtDay(endScan.at) : '—'}
          </T>
          <Meta>{win.length} scan{win.length === 1 ? '' : 's'}</Meta>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
          {[7, 14, 30].map(days => {
            const start = scans.findIndex(scan => +new Date(scan.at) >= +(new Date(scans[last]?.at ?? 0)) - days * 86400000);
            const selected = i0 === Math.max(0, start) && i1 === last;
            return <Pressable key={days} accessibilityRole="button" accessibilityLabel={`Show last ${days} days`} accessibilityState={{ selected }} onPress={() => {
              const end = scans[last];
              if (!end) return;
              const start = scans.findIndex(scan => +new Date(scan.at) >= +new Date(end.at) - days * 86400000);
              setRange([Math.max(0, start), last]);
            }} style={[styles.chip, selected && styles.chipOn]}><T v="small">{days} days</T></Pressable>;
          })}
        </View>
        <Disclosure title="Custom dates">
        {scans.length > 1 ? <RangeSlider count={scans.length} value={[i0, i1]} onChange={setRange} breaks={breaks} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Meta style={{ fontSize: 11 }}>{scans[0] ? fmtDay(scans[0].at) : ''}</Meta>
          <Meta style={{ fontSize: 11 }}>Drag the ends or the middle</Meta>
          <Meta style={{ fontSize: 11 }}>{scans[last] ? fmtDay(scans[last].at) : ''}</Meta>
        </View>
        </Disclosure>
      </View>

      {/* Map at end of range */}
      <Section title={`Teeth on ${endScan ? fmtDay(endScan.at) : '—'}`} action={<ArchToggle onChange={() => setTooth(null)} />}>
        <View style={styles.panel}>
          <View style={{ paddingHorizontal: 6, paddingTop: space.sm }}>
            <ArchDiagram key={arch} arch={arch} marks={marks} selected={selTooth} onSelect={setTooth} numbering={numbering} />
          </View>
          <View style={{ paddingBottom: space.md }}><Legend /></View>
          <Meta style={{ textAlign: 'center', padding: space.sm }}>Map shows the last scan in your selected dates</Meta>
        </View>
      </Section>

      {/* Selected tooth */}
      {selTooth != null ? (
        <Section title={`${toothNumber(toothByUniversal(selTooth), numbering)} · ${toothByUniversal(selTooth).name}`} action={<Button label="Clear" compact kind="ghost" onPress={() => setTooth(null)} />}>
          <View style={{ gap: space.sm }}>
            {!measuredBios.length ? <View style={[styles.panel, { padding: space.lg }]}><T v="body">No sensors for the selected measurements on this tooth. Choose another tooth or change Measurements above.</T></View> : null}
            {measuredBios.map((id) => {
              const b = BIOMARKERS[id];
              const tSites = (endStrip?.sites ?? []).filter((s) => s.toothUniversal === selTooth && s.biomarker === id);
              const series = tSites.map((s, k) => ({
                id: s.id,
                label: siteTitle(s, numbering).surface,
                color: k === 0 ? colors.seriesA : colors.seriesB,
                points: siteSeries(s.id, win, id).map((p): LPoint => ({ x: +new Date(p.at), y: p.value, hollow: p.value != null && p.quality < 0.35 })),
                markerColor: (p: LPoint) => STATUS_HEX[classify(p.y, b.bands)],
              }));
              const vals = series.flatMap((x) => x.points.map((p) => p.y)).filter((v): v is number => v != null);
              const lo = Math.min(...vals, b.bands.elevated);
              const hi = Math.max(...vals, b.bands.mild);
              const pad = (hi - lo) * 0.15 || 0.1;
              const ticks = niceTicks(Math.max(0, lo - pad), hi + pad);
              const yd: [number, number] = [Math.min(ticks[0], lo - pad), Math.max(ticks[ticks.length - 1], hi + pad)];
              return (
                <View key={id} style={[styles.panel, { padding: space.lg }]}>
                  <T v="small" style={{ color: colors.textSecondary }}>{b.name}</T>
                  {tSites.map((s) => {
                    const ser = siteSeries(s.id, win, id).filter((p) => p.value != null);
                    const first = ser[0]?.value ?? null;
                    const end = ser[ser.length - 1]?.value ?? null;
                    const st = classify(end, b.bands);
                    return (
                      <View key={s.id} style={[styles.valRow, { flexWrap: 'wrap' }]}>
                        <T v="small" style={{ flexGrow: 1, flexBasis: '100%', color: colors.text }}>{siteTitle(s, numbering).surface}</T>
                        <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                          {formatValue(b, end)}
                          <T v="small" style={{ color: colors.textMuted }}>{unitSuffix(b)}</T>
                        </T>
                        <T v="small" style={{ width: 52, textAlign: 'right', fontVariant: ['tabular-nums'], color: colors.textSecondary }}>
                          {first != null && end != null ? formatDelta(b, end - first) : '—'}
                        </T>
                        <View style={{ width: 104, alignItems: 'flex-end' }}>
                          <StatusTag status={st} label={st === 'unavailable' ? 'Not measured' : st === 'normal' ? 'In range' : b.statusWords[st]} />
                        </View>
                      </View>
                    );
                  })}
                  {tSites.length > 1 ? (
                    <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.sm }}>
                      {series.map((x) => (
                        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 12, height: 1.5, backgroundColor: x.color }} />
                          <Meta style={{ fontSize: 11 }}>{x.label}</Meta>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <View style={{ marginTop: space.sm, marginHorizontal: -space.sm }}>
                    <LineChart
                      series={series}
                      height={150}
                      yDomain={yd}
                      yTicks={ticks}
                      formatY={(v) => formatValue(b, v)}
                      xDomain={xd}
                      xTicks={[xd[0], xd[1]]}
                      formatX={(x) => fmtDay(x)}
                      formatTooltipX={(x) => new Date(x).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      band={b.bands.concern === 'low' ? { from: b.bands.mild, to: yd[1] } : { from: yd[0], to: b.bands.mild }}
                      surface={colors.surface}
                    />
                  </View>
                </View>
              );
            })}
          </View>
          <Meta style={{ marginTop: space.sm }}>Change shown from the start to the end of the selected range</Meta>
        </Section>
      ) : null}

      {/* Findings in range */}
      <Section title={`Flagged readings (${findings.length})`}>
        <View style={styles.panel}>
          {findings.length === 0 ? (
            <View style={{ padding: space.lg, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <StatusDot status="normal" />
              <T v="small" style={{ color: colors.text }}>{!endAnalysis || !sites.length ? 'No readings for these filters' : 'No flagged readings in the available scans'}</T>
            </View>
          ) : (
            (showAll ? findings : findings.slice(0, 5)).map((f, i) => {
              const t = siteTitle(f.s, numbering);
              const on = selTooth === f.s.toothUniversal;
              return (
                <Pressable
                  key={f.s.id}
                  onPress={() => setTooth(f.s.toothUniversal)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.border, (pressed || on) && { backgroundColor: colors.surfaceRaised }]}
                >
                  <StatusDot status={f.worst} size={6} />
                  <View style={{ flex: 1 }}>
                    <T v="small" style={{ color: colors.text }} numberOfLines={1}>{f.b.shortName} · {t.number} {t.surface.toLowerCase()}</T>
                    <Meta style={{ fontSize: 11 }}>{f.flagged} of {f.total} scans flagged · {f.worst === 'unavailable' ? 'Not measured' : f.b.statusWords[f.worst]}</Meta>
                  </View>
                  <T v="small" style={{ fontVariant: ['tabular-nums'], color: colors.text }}>{formatValue(f.b, f.end)}{unitSuffix(f.b)}</T>
                  <T v="small" style={{ width: 52, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{f.delta != null ? formatDelta(f.b, f.delta) : '—'}</T>
                </Pressable>
              );
            })
          )}
        </View>
        {findings.length > 5 ? <Button kind="ghost" label={showAll ? 'Show fewer readings' : `Show all ${findings.length} readings`} onPress={() => setShowAll(v => !v)} /> : null}
        <Meta style={{ marginTop: space.sm }}>Values are the latest available in this range; changes compare the first and last available readings.</Meta>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipOn: { backgroundColor: colors.surfaceRaised, borderColor: colors.textSecondary },
  rangeBox: { marginHorizontal: space.lg, marginTop: space.lg, padding: space.lg, paddingBottom: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  panel: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  valRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.lg, paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
