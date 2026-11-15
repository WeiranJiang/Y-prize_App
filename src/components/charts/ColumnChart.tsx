import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, font } from '../../theme/tokens';
import { T } from '../ui';

export interface Col {
  key: string;
  value: number;
  color: string;
  label?: string;
  tooltip: string;
}

/** Single-series columns, ≤24px, 4px rounded data-end, square at baseline. */
export default function ColumnChart({ cols, height = 140, max = 1, ticks = [0, 0.5, 1], formatY = (v: number) => `${Math.round(v * 100)}%`, threshold }: { cols: Col[]; height?: number; max?: number; ticks?: number[]; formatY?: (v: number) => string; threshold?: { y: number; label: string } }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const L = 34;
  const B = 20;
  const iw = Math.max(1, w - L - 8);
  const ih = height - B - 10;
  const slot = iw / Math.max(1, cols.length);
  const bw = Math.min(24, slot - 2);
  const y = (v: number) => 10 + (1 - v / max) * ih;
  const bar = (x: number, v: number) => {
    const top = y(v);
    const bottom = y(0);
    const r = Math.min(4, (bottom - top) / 2, bw / 2);
    return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${bottom} Z`;
  };
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Pressable
          style={{ flex: 1 }}
          onPressIn={(e) => setSel(Math.max(0, Math.min(cols.length - 1, Math.floor((e.nativeEvent.locationX - L) / slot))))}
          onPressOut={() => setTimeout(() => setSel(null), 1600)}
        >
          <Svg width={w} height={height} pointerEvents="none">
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={L} x2={L + iw} y1={y(t)} y2={y(t)} stroke={colors.hairline} strokeWidth={1} />
                <SvgText x={L - 8} y={y(t) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font.family} fontWeight="400">{formatY(t)}</SvgText>
              </G>
            ))}
            {cols.map((c, i) => (
              <Path key={c.key} d={bar(L + i * slot + (slot - bw) / 2, c.value)} fill={c.color} opacity={sel == null || sel === i ? 1 : 0.45} />
            ))}
            {threshold ? (
              <G>
                <Line x1={L} x2={L + iw} y1={y(threshold.y)} y2={y(threshold.y)} stroke={colors.textSecondary} strokeWidth={1} opacity={0.6} />
                <SvgText x={L + iw} y={y(threshold.y) - 5} fontSize={9.5} fill={colors.textSecondary} textAnchor="end" fontFamily={font.family} fontWeight="500">{threshold.label}</SvgText>
              </G>
            ) : null}
            {cols.map((c, i) =>
              c.label ? (
                <SvgText key={c.key + 'l'} x={L + i * slot + slot / 2} y={height - 5} fontSize={9.5} fill={colors.textMuted} textAnchor="middle" fontFamily={font.family} fontWeight="400">{c.label}</SvgText>
              ) : null,
            )}
          </Svg>
          {sel != null && cols[sel] ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: Math.min(Math.max(L, L + sel * slot - 60), w - 150), width: 150, backgroundColor: colors.surfaceRaised, borderRadius: 10, borderWidth: 1, borderColor: colors.hairlineStrong, padding: 8 }}>
              <T v="small" style={{ fontSize: 11, color: colors.text }}>{cols[sel].tooltip}</T>
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}
