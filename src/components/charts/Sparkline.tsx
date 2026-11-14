import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { Bands, classify } from '../../domain/biomarkers';
import { STATUS_HEX } from '../../three/regions';
import { colors } from '../../theme/tokens';

/** Compact single-series trend. Gaps (null) break the line and leave a hollow tick. */
export default function Sparkline({ points, bands, height = 36, domain }: { points: (number | null)[]; bands?: Bands; height?: number; domain?: [number, number] }) {
  const [w, setW] = useState(0);
  const vals = points.filter((v): v is number => v != null);
  const lo = domain?.[0] ?? Math.min(...vals, bands ? bands.elevated : Infinity) - 0.2;
  const hi = domain?.[1] ?? Math.max(...vals, bands ? bands.mild : -Infinity) + 0.2;
  const pad = 5;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (height - pad * 2);
  let d = '';
  let pen = false;
  points.forEach((v, i) => {
    if (v == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const lastIdx = points.length - 1;
  const last = points[lastIdx];
  return (
    <View style={{ height }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {bands ? <Line x1={pad} x2={w - pad} y1={y(bands.elevated)} y2={y(bands.elevated)} stroke={colors.hairlineStrong} strokeWidth={1} /> : null}
          <Path d={d} stroke={colors.textSecondary} strokeWidth={1.6} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {points.map((v, i) =>
            v == null ? (
              <Circle key={i} cx={x(i)} cy={height - pad} r={2} stroke={colors.unavailable} strokeWidth={1} fill="none" />
            ) : null,
          )}
          {last != null ? (
            <Circle cx={x(lastIdx)} cy={y(last)} r={4} fill={bands ? STATUS_HEX[classify(last, bands)] : colors.text} stroke={colors.surface} strokeWidth={2} />
          ) : null}
        </Svg>
      )}
    </View>
  );
}
