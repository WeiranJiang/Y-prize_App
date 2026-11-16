import React from 'react';
import { View } from 'react-native';
import { BIOMARKERS, BIOMARKER_COLORS, BIOMARKER_ORDER, BiomarkerId } from '../domain/biomarkers';
import { colors, space } from '../theme/tokens';
import { T } from './ui';

/** Colours identify sensor chemistry, never clinical severity. Hollow rings are references. */
export default function BiomarkerLegend({ only }: { mode?: 'overview' | BiomarkerId; only?: BiomarkerId[] }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, justifyContent: 'center', paddingHorizontal: space.md }}>
    {(only ?? BIOMARKER_ORDER).map(id => <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BIOMARKER_COLORS[id] }} /><T v="small" style={{ color: colors.textSecondary }}>{BIOMARKERS[id].shortName}</T></View>)}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 9, height: 9, borderRadius: 5, borderWidth: 1, borderColor: colors.textSecondary }} /><T v="small">Reference</T></View>
  </View>;
}
