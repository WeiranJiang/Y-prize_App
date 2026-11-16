import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { confidenceOf, readingStatus, siteSeries, siteTitle } from '../domain/analysis';
import { BIOMARKERS, formatDelta, formatReading, formatValue, unitSuffix } from '../domain/biomarkers';
import { useStore } from '../state/store';
import { colors, space } from '../theme/tokens';
import Sparkline from './charts/Sparkline';
import { Button, Divider, StatusTag, T } from './ui';

export function OIR({ observed, interpreted, recommended }: { observed: string; interpreted: string; recommended: string }) {
  const block = (k: string, v: string) => (
    <View style={{ marginTop: space.md }}>
      <T v="label" style={{ fontSize: 10 }}>{k}</T>
      <T v="body" style={{ marginTop: 4, color: k === 'Recommended' ? colors.text : colors.textSecondary }}>{v}</T>
    </View>
  );
  return (
    <View>
      {block('Observed', observed)}
      {block('Interpreted', interpreted)}
      {block('Recommended', recommended)}
    </View>
  );
}

export default function SiteDetail({ siteId, showExplore = true }: { siteId: string; showExplore?: boolean }) {
  const { analysis, insights, state } = useStore();
  const scans = state.scans;
  if (!analysis) return null;
  const r = analysis.results.find((x) => x.site.id === siteId);
  if (!r) return null;
  const b = BIOMARKERS[r.site.biomarker];
  const t = siteTitle(r.site, state.settings.numbering);
  const status = readingStatus(r.reading);
  const ref = analysis.comparison;
  const insight = insights.find((i) => i.siteIds.includes(siteId) && (i.kind === 'finding' || i.kind === 'quality'));
  const series = siteSeries(siteId, scans, r.site.biomarker).slice(-10);
  const isComparison = r.site.role === 'comparison';

  return (
    <View>
      <T v="label">{t.number} · {isComparison ? 'Comparison site' : t.surface}</T>
      <T v="title" style={{ marginTop: 6 }}>{t.title}</T>
      <T v="body" style={{ marginTop: 2 }}>{t.surface} {r.site.surface === 'gingival' ? '' : 'surface'}</T>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: space.xl }}>
        <View>
          <T v="label" style={{ fontSize: 10 }}>{b.name}</T>
          {r.reading.value != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
              <T v="number" style={{ fontSize: 44 }}>{formatValue(b, r.reading.value)}</T>
              <T v="small" style={{ marginLeft: 6 }}>± {formatValue(b, r.reading.uncertainty)}{unitSuffix(b)}</T>
            </View>
          ) : (
            <T v="number" style={{ fontSize: 32, color: colors.textSecondary, marginTop: 4 }}>Not measured</T>
          )}
        </View>
        <StatusTag status={status} label={status === 'unavailable' ? 'Unmeasured' : b.statusWords[status]} />
      </View>

      {series.length > 1 ? (
        <View style={{ marginTop: space.lg }}>
          <Sparkline points={series.map((p) => p.value)} bands={b.bands} height={44} />
          <T v="small" style={{ fontSize: 11, marginTop: 4 }}>Last {series.length} scans · gaps are scans where this site was not usable</T>
        </View>
      ) : null}

      <Divider style={{ marginVertical: space.lg }} />
      <View style={{ flexDirection: 'row', gap: space.xl }}>
        {!isComparison && r.site.biomarker === 'pH' && ref?.reading.value != null ? (
          <View style={{ flex: 1 }}>
            <T v="label" style={{ fontSize: 10 }}>Comparison site</T>
            <T v="bodyStrong" style={{ marginTop: 4 }}>{formatValue(b, ref.reading.value)}</T>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <T v="label" style={{ fontSize: 10 }}>Previous</T>
          <T v="bodyStrong" style={{ marginTop: 4 }}>
            {r.previous ? formatValue(b, r.previous.value) : '—'}
            {r.change != null ? <T v="small">{`  ${formatDelta(b, r.change)}`}</T> : null}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="label" style={{ fontSize: 10 }}>Quality</T>
          <T v="bodyStrong" style={{ marginTop: 4 }}>{r.reading.value == null ? 'Withheld' : confidenceOf(r.reading.quality)}</T>
        </View>
      </View>
      {r.previous && !r.previous.comparable ? (
        <T v="small" style={{ marginTop: space.sm }}>Previous value came from a different strip calibration; treat the change as approximate.</T>
      ) : null}

      {insight ? (
        <>
          <Divider style={{ marginTop: space.lg }} />
          <OIR observed={insight.observed} interpreted={insight.interpreted} recommended={insight.recommended} />
          <T v="small" style={{ marginTop: space.md, fontSize: 11 }}>Rule {insight.rule} · {insight.criterion} · Confidence {insight.confidence.toLowerCase()}</T>
        </>
      ) : r.reading.value != null ? (
        <>
          <Divider style={{ marginTop: space.lg }} />
          <OIR
            observed={`${formatReading(b, r.reading.value)} at readout${r.site.biomarker === 'pH' && ref?.reading.value != null && !isComparison ? `, comparison site ${formatValue(b, ref.reading.value)}` : ''}.`}
            interpreted={status === 'normal' ? 'Within the configured range at this location.' : `Slightly ${b.concernWord} than the configured range. A single mild reading is common and often reflects a recent meal or drink.`}
            recommended={status === 'normal' ? 'No change suggested here.' : 'Keep cleaning this area as usual; the app will tell you if it recurs.'}
          />
        </>
      ) : null}

      <View style={{ marginTop: space.lg, padding: space.md, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.007)' }}>
        <T v="small">{b.limitation} This finding is not a diagnosis.</T>
      </View>

      {showExplore ? (
        <Button
          label="View reading history"
          kind="secondary"
          style={{ marginTop: space.lg }}
          onPress={() => router.navigate({ pathname: '/trends', params: { tooth: String(r.site.toothUniversal), bio: r.site.biomarker } })}
        />
      ) : null}
    </View>
  );
}
