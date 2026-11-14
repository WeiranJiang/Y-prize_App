import { router, useIsFocused } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, View } from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import CaseIndicator from '../../components/CaseIndicator';
import FloatingLabel from '../../components/FloatingLabel';
import Icon from '../../components/Icon';
import SiteDetail from '../../components/SiteDetail';
import StripHealthCard from '../../components/StripHealthCard';
import { Card, DemoBadge, Legend, Screen, Section, StatusDot, T } from '../../components/ui';
import { readingStatus, siteTitle } from '../../domain/analysis';
import { BIOMARKERS, formatValue } from '../../domain/biomarkers';
import { pct } from '../../domain/fouling';
import type { Insight } from '../../domain/insights';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { regionsForScan } from '../../three/regions';
import { colors, space } from '../../theme/tokens';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

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
  return (
    <Card style={{ width, minHeight: 150 }} onPress={i.action ? () => router.push(i.action!.href as never) : undefined}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {s ? <StatusDot status={s} /> : <Icon name="info" size={14} color={colors.textSecondary} />}
        <T v="label" style={{ fontSize: 10 }}>{i.kind === 'finding' ? 'Finding' : i.kind === 'stable' ? 'Stable' : i.kind === 'strip' ? 'Strip' : i.kind === 'quality' ? 'Scan quality' : 'Routine'}</T>
      </View>
      <T v="bodyStrong" style={{ marginTop: space.md }}>{i.title}</T>
      <T v="small" style={{ marginTop: 6 }} numberOfLines={4}>{i.summary}</T>
      <T v="small" style={{ marginTop: 'auto', paddingTop: space.md, fontSize: 11, color: colors.textMuted }}>Confidence: {i.confidence.toLowerCase()}</T>
    </Card>
  );
}

export default function Home() {
  const { latestScan, stripById, analysis, insights, recommendations, state } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  const regions = useMemo(() => regionsForScan(latestScan, strip, 'overview'), [latestScan, strip, state.rev]);
  const [sel, setSel] = useState<Selection | null>(null);
  const labelPos = useRef(new Animated.ValueXY({ x: -500, y: -500 })).current;
  const H = Dimensions.get('window').height;
  const W = Dimensions.get('window').width;

  const selResult = sel?.siteId ? analysis?.results.find((r) => r.site.id === sel.siteId) : undefined;
  const onSelect = (s: Selection | null) => {
    if (s && !s.siteId && s.tooth) {
      router.navigate({ pathname: '/explore', params: { tooth: String(s.tooth) } });
      return;
    }
    setSel(s);
  };

  const review = analysis?.reviewSites.length ?? 0;
  const below = analysis?.belowThreshold.length ?? 0;
  const quality = analysis ? analysis.usable / analysis.total : 0;
  const top = insights.filter((i) => i.kind !== 'routine').slice(0, 5);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <T v="display">{greeting()}</T>
            <T v="body" style={{ marginTop: 4 }}>Here's your latest oral health snapshot.</T>
          </View>
          <CaseIndicator />
        </View>

        {/* Hero */}
        <View style={{ height: Math.max(340, H * 0.5), marginTop: space.sm }}>
          <RetainerView
            style={{ flex: 1 }}
            regions={regions}
            reveal
            selectedTooth={sel?.tooth ?? null}
            selectedSiteId={sel?.siteId ?? null}
            focusTooth={sel?.tooth ?? null}
            onSelect={onSelect}
            labelPos={labelPos}
            active={focused}
          />
          {selResult ? (
            <FloatingLabel
              pos={labelPos}
              title={`${siteTitle(selResult.site, state.settings.numbering).number} · ${siteTitle(selResult.site).surface}`}
              value={selResult.reading.value != null ? `pH ${formatValue(BIOMARKERS.pH, selResult.reading.value)}` : 'Not measured'}
              status={readingStatus(selResult.reading)}
            />
          ) : null}
          {latestScan?.demo ? <DemoBadge style={{ position: 'absolute', left: space.xl, top: space.sm }} /> : null}
        </View>

        <View style={{ alignItems: 'center', paddingHorizontal: space.xl }}>
          <T v="heading">Your oral health map</T>
          <T v="small" style={{ marginTop: 4 }}>{latestScan ? `Last scanned ${scanTimeLabel(latestScan.at)}` : 'No scans yet'}</T>
          <T v="small" style={{ marginTop: 2, color: colors.textMuted, fontSize: 12 }}>Drag to explore your teeth · tap a coloured area</T>
          <View style={{ marginTop: space.lg }}>
            <Legend title="Local pH" />
          </View>
        </View>

        {/* Summary */}
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.xl, marginTop: space.xxl }}>
          <Card style={{ flex: 1, padding: 14 }} onPress={() => router.navigate('/explore')}>
            <T v="small" style={{ fontSize: 12 }}>To review</T>
            <T v="number" style={{ marginTop: 6 }}>{review}</T>
            <T v="small" style={{ fontSize: 11 }}>{review === 1 ? 'location' : 'locations'}</T>
          </Card>
          <Card style={{ flex: 1, padding: 14 }} onPress={() => router.navigate({ pathname: '/trends' })}>
            <T v="small" style={{ fontSize: 12 }}>Acidity</T>
            <T v="number" style={{ marginTop: 6 }}>{below}</T>
            <T v="small" style={{ fontSize: 11 }}>{below === 1 ? 'site' : 'sites'} below pH {state.settings.pHBands.elevated.toFixed(1)}</T>
          </Card>
          <Card style={{ flex: 1, padding: 14 }} onPress={() => latestScan && router.push({ pathname: '/scan-details', params: { id: latestScan.id } })}>
            <T v="small" style={{ fontSize: 12 }}>Scan quality</T>
            <T v="number" style={{ marginTop: 6 }}>{pct(quality)}</T>
            <T v="small" style={{ fontSize: 11 }}>usable readings</T>
          </Card>
        </View>

        <Section title="Strip health">
          <StripHealthCard compact />
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
              Local pH is a research indicator and does not diagnose decay or gum disease. How findings are made →
            </T>
          </Pressable>
        </Section>
      </Screen>

      <BottomSheet open={!!sel?.siteId} onClose={() => setSel(null)}>
        {sel?.siteId ? <SiteDetail siteId={sel.siteId} /> : null}
      </BottomSheet>
    </View>
  );
}
