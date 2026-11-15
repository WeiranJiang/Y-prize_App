import React from 'react';
import { View } from 'react-native';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId } from '../domain/biomarkers';
import { SEVERITY_INTENSITY } from '../three/regions';
import { colors } from '../theme/tokens';
import { T } from './ui';

function mix(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const base = [0xee, 0xf1, 0xfa];
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(base[i] + (v - base[i]) * k));
  return `rgb(${c.join(',')})`;
}

/**
 * Colour key for the 3D map. Overview: one colour per biomarker (only
 * concerning readings are coloured). Single biomarker: its colour at each
 * severity step. Colour is always paired with a name.
 */
export default function BiomarkerLegend({ mode, only }: { mode: 'overview' | BiomarkerId; only?: BiomarkerId[] }) {
  if (mode === 'overview') {
    const list = only?.length ? BIOMARKER_ORDER.filter((b) => only.includes(b)) : BIOMARKER_ORDER;
    return (
      <View style={{ alignItems: 'center', paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
          {list.map((id) => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BIOMARKERS[id].color }} />
              <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>{BIOMARKERS[id].shortName}</T>
            </View>
          ))}
        </View>
        <T v="small" style={{ fontSize: 10.5, marginTop: 6, color: colors.textMuted }}>
          Coloured only where a reading needs attention · deeper colour = more concern · white = in range
        </T>
      </View>
    );
  }
  const b = BIOMARKERS[mode];
  const steps = [
    { k: 'mild' as const, label: b.statusWords.mild },
    { k: 'elevated' as const, label: b.statusWords.elevated },
    { k: 'high' as const, label: b.statusWords.high },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.point }} />
        <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>In range</T>
      </View>
      {steps.map((s) => (
        <View key={s.k} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: mix(b.color, SEVERITY_INTENSITY[s.k]) }} />
          <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>{s.label}</T>
        </View>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.unavailable }} />
        <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>Unmeasured</T>
      </View>
    </View>
  );
}
