import { router } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import ArchToggle from '../components/ArchToggle';
import BiomarkerLegend from '../components/BiomarkerLegend';
import { Card, DemoBadge, IconButton, Screen, Section, Segmented, StatusDot, T } from '../components/ui';
import { readingStatus, scansComparable, siteTitle } from '../domain/analysis';
import { formatDelta, formatValue, BIOMARKERS } from '../domain/biomarkers';
import { useStore } from '../state/store';
import RetainerView, { makeCamera } from '../three/RetainerView';
import { regionsForScan } from '../three/regions';
import { colors, space } from '../theme/tokens';

const label = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function Compare() {
  const { state, stripById, arch } = useStore();
  const scans = useMemo(
    () => state.scans.filter((s) => stripById(s.stripId)?.arch === arch).sort((a, b) => +new Date(a.at) - +new Date(b.at)),
    [state.scans, arch, stripById],
  );
  const [aSel, setA] = useState<string | null>(null);
  const [bSel, setB] = useState<string | null>(null);
  const aId = aSel && scans.find((s) => s.id === aSel) ? aSel : scans[Math.max(0, scans.length - 5)].id;
  const bId = bSel && scans.find((s) => s.id === bSel) ? bSel : scans[scans.length - 1].id;
  const [mode, setMode] = useState<'slider' | 'split'>('slider');
  const [w, setW] = useState(0);
  const [split, setSplit] = useState(0.5);
  const camera = useRef(makeCamera()).current;
  const A = scans.find((s) => s.id === aId)!;
  const B = scans.find((s) => s.id === bId)!;
  const rA = useMemo(() => regionsForScan(A, stripById(A.stripId), 'overview'), [A, stripById]);
  const rB = useMemo(() => regionsForScan(B, stripById(B.stripId), 'overview'), [B, stripById]);
  const comp = scansComparable(A, B);
  const strip = stripById(B.stripId)!;
  const numbering = state.settings.numbering;

  const startSplit = useRef(0.5);
  const handle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startSplit.current = splitRef.current;
      },
      onPanResponderMove: (_, g) => setSplit(Math.min(0.95, Math.max(0.05, startSplit.current + g.dx / Math.max(1, wRef.current)))),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  const splitRef = useRef(split);
  splitRef.current = split;
  const wRef = useRef(w);
  wRef.current = w;

  const options = scans.map((s) => ({ key: s.id, label: label(s.at) }));
  const H = 340;

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton name="chevronLeft" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/trends'))} />
        <DemoBadge />
      </View>
      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
        <T v="display">Compare scans</T>
        <T v="small" style={{ marginTop: 4 }}>Identical camera, colour scale and anatomical registration.</T>
        <View style={{ marginTop: space.md }}>
          <ArchToggle />
        </View>
      </View>

      <View style={{ marginTop: space.lg, gap: 6 }}>
        <T v="label" style={{ paddingHorizontal: space.lg }}>Before</T>
        <Segmented options={options} value={aId} onChange={setA} />
        <T v="label" style={{ paddingHorizontal: space.lg, marginTop: 6 }}>After</T>
        <Segmented options={options} value={bId} onChange={setB} />
      </View>

      <View style={{ marginTop: space.lg }}>
        <Segmented options={[{ key: 'slider', label: 'Slider' }, { key: 'split', label: 'Split screen' }]} value={mode} onChange={setMode} />
      </View>

      {mode === 'slider' ? (
        <View style={{ height: H, marginTop: space.md }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
          <RetainerView key={arch + 'b'} arch={arch} style={StyleSheet.absoluteFill} regions={rB} sharedCamera={camera} autoRotate={false} />
          {w > 0 && (
            <View style={[StyleSheet.absoluteFill, { width: w * split, overflow: 'hidden' }]}>
              <RetainerView key={arch + 'a'} arch={arch} style={{ width: w, height: H }} regions={rA} sharedCamera={camera} autoRotate={false} />
            </View>
          )}
          {w > 0 && (
            <View {...handle.panHandlers} style={[styles.handleHit, { left: w * split - 22 }]}>
              <View style={styles.handleLine} />
              <View style={styles.handleKnob}>
                <T v="small" style={{ color: colors.textOnLight, fontSize: 11 }}>‹ ›</T>
              </View>
            </View>
          )}
          <T v="label" style={{ position: 'absolute', left: space.xl, top: 6, fontSize: 10 }}>{label(A.at)}</T>
          <T v="label" style={{ position: 'absolute', right: space.xl, top: 6, fontSize: 10 }}>{label(B.at)}</T>
        </View>
      ) : (
        <View style={{ marginTop: space.md }}>
          {[{ s: A, r: rA, t: 'Before' }, { s: B, r: rB, t: 'After' }].map((x) => (
            <View key={x.t} style={{ height: 220 }}>
              <RetainerView key={arch + x.t} arch={arch} style={{ flex: 1 }} regions={x.r} sharedCamera={camera} autoRotate={false} />
              <T v="label" style={{ position: 'absolute', left: space.xl, top: 6, fontSize: 10 }}>{x.t} · {label(x.s.at)}</T>
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: space.sm }}>
        <BiomarkerLegend mode="overview" />
      </View>

      <Section>
        <Card style={!comp.ok ? { borderColor: 'rgba(240,199,109,0.45)' } : undefined}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <StatusDot status={comp.ok ? 'normal' : 'mild'} />
            <T v="bodyStrong">{comp.ok ? 'Readout conditions comparable' : 'Not directly comparable'}</T>
          </View>
          {comp.ok ? (
            <T v="small" style={{ marginTop: 6 }}>Same strip calibration and both read within the protocol window. Differences reflect measured changes, within each reading's uncertainty.</T>
          ) : (
            <>
              {comp.reasons.map((r) => (
                <T key={r} v="small" style={{ marginTop: 6 }}>• {r}</T>
              ))}
              <T v="small" style={{ marginTop: 8, color: colors.text }}>Differences are shown, but not interpreted as improvement or worsening.</T>
            </>
          )}
        </Card>
      </Section>

      <Section title="Site by site">
        <Card style={{ paddingVertical: 4 }}>
          <ScrollView scrollEnabled={false}>
            {strip.sites.map((s, i) => {
              const ra = A.readings.find((r) => r.siteId === s.id);
              const rb = B.readings.find((r) => r.siteId === s.id);
              const t = siteTitle(s, numbering);
              const d = ra?.value != null && rb?.value != null ? rb.value - ra.value : null;
              return (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.hairline }}>
                  <T v="small" style={{ flex: 1, color: colors.text }} numberOfLines={1}>{t.number} {t.surface.toLowerCase()} · {BIOMARKERS[s.biomarker].shortName}</T>
                  <View style={{ width: 56, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <StatusDot status={readingStatus(ra)} size={6} />
                    <T v="small">{formatValue(BIOMARKERS[s.biomarker], ra?.value)}</T>
                  </View>
                  <View style={{ width: 56, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <StatusDot status={readingStatus(rb)} size={6} />
                    <T v="small">{formatValue(BIOMARKERS[s.biomarker], rb?.value)}</T>
                  </View>
                  <T v="small" style={{ width: 44, textAlign: 'right', color: colors.text, fontVariant: ['tabular-nums'] }}>{formatDelta(BIOMARKERS[s.biomarker], d)}</T>
                </View>
              );
            })}
          </ScrollView>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  handleHit: { position: 'absolute', top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  handleLine: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(247,248,252,0.6)' },
  handleKnob: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
});
