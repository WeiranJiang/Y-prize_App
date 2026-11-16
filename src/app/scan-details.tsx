import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Disclosure from '../components/Disclosure';
import { Card, DemoBadge, IconButton, KV, Screen, Section, StatusDot, T } from '../components/ui';
import { analyzeScan, confidenceOf, siteTitle } from '../domain/analysis';
import { BIOMARKERS, formatValue, unitSuffix } from '../domain/biomarkers';
import { clarityOf, pct } from '../domain/fouling';
import { useStore } from '../state/store';
import { colors, space } from '../theme/tokens';

export default function ScanDetails() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { state, latestScan, stripById } = useStore();
  const scan = (id && state.scans.find((s) => s.id === id)) || latestScan;
  if (!scan) return <Screen><T v="body">No scan.</T></Screen>;
  const strip = stripById(scan.stripId)!;
  const a = analyzeScan(scan, strip, state.scans);
  const numbering = state.settings.numbering;

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton name="chevronLeft" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        {scan.demo ? <DemoBadge /> : null}
      </View>
      <View style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
        <T v="label">Scan details</T>
        <T v="display" style={{ fontSize: 28, marginTop: 6 }}>
          {new Date(scan.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </T>
      </View>

      <Section>
        <Card>
          <KV k="Sites analysed" v={`${a.usable} of ${a.total}`} />
          <KV k="Areas to review" v={`${a.reviewSites.length}`} />
          <KV k="Strip" v={`${strip.arch === 'upper' ? 'Upper' : 'Lower'} · ${strip.id} · session ${scan.sessionIndex}${scan.baseline ? ' (baseline)' : ''}`} />
          <KV k="Strip clarity" v={pct(clarityOf(scan))} />
          <Disclosure title="Technical details" summary="Wear time, exposure, calibration and readout timing">
          <KV k="Session wear" v={`${scan.sessionMinutes} min (demo protocol)`} />
          <KV k="Strip exposure" v={`${scan.exposureHours.toFixed(0)} h`} />
          <KV k="Readout delay" v={`${scan.readoutDelayMin.toFixed(1)} min · window ${scan.readoutWindowMin} min`} />
          <KV k="Calibration" v={scan.calibrationVersion} />
          </Disclosure>
          <T v="small" style={{ marginTop: space.md }}>
            Values describe the strip's state at readout. They are not a record of the whole wear period.
          </T>
        </Card>
      </Section>

      <Section title="Every site">
        <Card style={{ paddingVertical: 4 }}>
          {a.results.map((r, i) => {
            const t = siteTitle(r.site, numbering);
            return (
              <View key={r.site.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: colors.hairline }}>
                <StatusDot status={r.status} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <T v="small" style={{ color: colors.text }}>{BIOMARKERS[r.site.biomarker].shortName} · {t.number} {t.surface.toLowerCase()}{r.site.role === 'comparison' ? ' (comparison)' : ''}</T>
                  <T v="small" style={{ fontSize: 11 }}>
                    {r.reading.value == null ? 'Withheld: below signal floor' : `Quality ${confidenceOf(r.reading.quality).toLowerCase()} · SNR ${r.reading.snr.toFixed(0)}${r.reading.calibration === 'recalibrate' ? ' · recalibrate' : ''}`}
                  </T>
                </View>
                <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>{formatValue(BIOMARKERS[r.site.biomarker], r.reading.value)}<T v="small">{unitSuffix(BIOMARKERS[r.site.biomarker])}</T></T>
              </View>
            );
          })}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
