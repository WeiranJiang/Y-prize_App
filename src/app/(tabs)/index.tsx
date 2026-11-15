import { router, useIsFocused } from 'expo-router';
import React, { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, View } from 'react-native';
import BottomSheet from '../../components/BottomSheet';
import ArchToggle from '../../components/ArchToggle';
import CaseIndicator from '../../components/CaseIndicator';
import FloatingLabel from '../../components/FloatingLabel';
import Icon from '../../components/Icon';
import SiteDetail from '../../components/SiteDetail';
import StripHealthCard from '../../components/StripHealthCard';
import { Card, Screen, Section, StatusDot, T } from '../../components/ui';
import { readingStatus, siteTitle } from '../../domain/analysis';
import { BIOMARKERS, formatValue } from '../../domain/biomarkers';
import { pct } from '../../domain/fouling';
import type { Insight } from '../../domain/insights';
import { useStore } from '../../state/store';
import RetainerView, { Selection } from '../../three/RetainerView';
import { regionsForScan } from '../../three/regions';
import { colors, space } from '../../theme/tokens';

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
        {i.biomarker && i.kind === 'finding' ? (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BIOMARKERS[i.biomarker as keyof typeof BIOMARKERS].color }} />
        ) : s ? (
          <StatusDot status={s} />
        ) : (
          <Icon name="info" size={14} color={colors.textSecondary} />
        )}
        <T v="label" style={{ fontSize: 10 }}>{i.kind === 'finding' ? (i.biomarker ? BIOMARKERS[i.biomarker as keyof typeof BIOMARKERS].shortName : 'Finding') : i.kind === 'stable' ? 'Stable' : i.kind === 'strip' ? 'Strip' : i.kind === 'quality' ? 'Scan quality' : 'Routine'}</T>
      </View>
      <T v="bodyStrong" style={{ marginTop: space.md }}>{i.title}</T>
      <T v="small" style={{ marginTop: 6 }} numberOfLines={4}>{i.summary}</T>
      <T v="small" style={{ marginTop: 'auto', paddingTop: space.md, fontSize: 11, color: colors.textMuted }}>Confidence: {i.confidence.toLowerCase()}</T>
    </Card>
  );
}

export default function Home() {
  const { latestScan, stripById, analysis, insights, recommendations, state, arch } = useStore();
  const focused = useIsFocused();
  const strip = latestScan ? stripById(latestScan.stripId) : undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const quality = analysis ? analysis.usable / analysis.total : 0;
  const top = insights.filter((i) => i.kind !== 'routine').slice(0, 5);
  const selBm = selResult ? BIOMARKERS[selResult.site.biomarker] : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ArchToggle onChange={() => setSel(null)} />
          <CaseIndicator />
        </View>

        {/* Hero */}
        <View style={{ height: Math.max(330, H * 0.47), marginTop: space.sm }}>
          <RetainerView
            key={arch}
            arch={arch}
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
          {selResult && selBm ? (
            <FloatingLabel
              pos={labelPos}
              title={`${siteTitle(selResult.site, state.settings.numbering).number} · ${siteTitle(selResult.site).surface}`}
              value={selResult.reading.value != null ? `${selBm.shortName} ${formatValue(selBm, selResult.reading.value)} ${selBm.unit === 'pH' ? '' : selBm.unit}` : 'Not measured'}
              status={readingStatus(selResult.reading)}
            />
          ) : null}
        </View>

        <T v="small" style={{ textAlign: 'center', paddingHorizontal: space.xl, color: colors.textSecondary }}>
          {latestScan ? `Last scanned ${scanTimeLabel(latestScan.at)} · Scan quality ${pct(quality)}` : 'No scans yet'}
        </T>

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
              pH, lactate, calcium, phosphate, fluoride and ammonium readings are research indicators and do not diagnose decay or gum disease. How findings are made →
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
