import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BIOMARKERS, formatValue, unitSuffix } from '../domain/biomarkers';
import type { BiomarkerStat } from '../domain/overview';
import { colors, radius, space } from '../theme/tokens';
import Sparkline from './charts/Sparkline';
import { StatusDot, T } from './ui';

export function statLine(s: BiomarkerStat) {
  if (BIOMARKERS[s.id].bands.configured === false) return 'Not calibrated';
  if (s.attention) return s.attention > 1 ? `${s.attention} sites need attention` : '1 site needs attention';
  if (s.borderline) return `${s.borderline} borderline`;
  if (s.status === 'unavailable') return 'Not measured';
  return 'All sites in range';
}

/** Compact metric tile: name, median value + unit, status line, minimal trend. */
export default function BiomarkerCard({ s }: { s: BiomarkerStat }) {
  const b = BIOMARKERS[s.id];
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/biomarker', params: { id: s.id } })}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceRaised }]}
      accessibilityLabel={`${b.name}, ${formatValue(b, s.median)} ${b.unit}, ${statLine(s)}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T v="small" style={{ color: colors.textSecondary, fontSize: 13 }}>{b.shortName}</T>
        <StatusDot status={s.status} size={6} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: space.sm }}>
        <T v="number" style={{ fontSize: 26 }}>{formatValue(b, s.median)}</T>
        <T v="small" style={{ marginLeft: 4, fontSize: 12, color: colors.textMuted }}>{b.unit === 'pH' ? 'pH' : unitSuffix(b).trim()}</T>
      </View>
      <T v="small" style={{ fontSize: 12, marginTop: 2, color: s.status === 'high' || s.status === 'mild' ? colors.text : colors.textMuted }} numberOfLines={1}>
        {statLine(s)}
      </T>
      <View style={{ marginTop: space.sm }}>
        <Sparkline points={s.series.map((p) => p.value)} bands={b.bands} height={26} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 14,
  },
});
