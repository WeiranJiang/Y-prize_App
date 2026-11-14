/**
 * Minimal line chart: 2px lines, ≥8px markers with a surface ring, hairline
 * solid grid, gaps for missing data (with a hollow tick on the baseline),
 * hollow markers for low-quality points, tap/hover crosshair + tooltip.
 * Text never wears series colour.
 */
import React, { useMemo, useState } from 'react';
import { GestureResponderEvent, Platform, Pressable, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, font } from '../../theme/tokens';
import { T } from '../ui';

export interface LPoint {
  x: number;
  y: number | null;
  /** Hollow marker = reduced quality. */
  hollow?: boolean;
  note?: string;
}
export interface LSeries {
  id: string;
  label: string;
  color: string;
  points: LPoint[];
  dashed?: boolean;
  /** Marker colour per point (e.g. status). Defaults to series colour. */
  markerColor?: (p: LPoint) => string;
  markers?: boolean;
}

interface Props {
  series: LSeries[];
  height?: number;
  yDomain: [number, number];
  yTicks: number[];
  formatY?: (v: number) => string;
  formatX: (x: number) => string;
  formatTooltipX?: (x: number) => string;
  xDomain?: [number, number];
  xTicks?: number[];
  band?: { from: number; to: number; label?: string };
  thresholds?: { y: number; label: string }[];
  verticals?: { x: number; label: string }[];
  endLabels?: boolean;
  surface?: string;
}

const PAD = { l: 34, r: 14, t: 12, b: 24 };

export default function LineChart(props: Props) {
  const { series, height = 200, yDomain, yTicks, formatY = (v) => v.toFixed(1), formatX, band, thresholds, verticals, surface = colors.bg2 } = props;
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const allX = useMemo(() => series.flatMap((s) => s.points.map((p) => p.x)), [series]);
  const xd: [number, number] = props.xDomain ?? [Math.min(...allX), Math.max(...allX)];
  const endPad = props.endLabels ? 46 : 0;
  const iw = Math.max(1, w - PAD.l - PAD.r - endPad);
  const ih = height - PAD.t - PAD.b;
  const sx = (x: number) => PAD.l + ((x - xd[0]) / (xd[1] - xd[0] || 1)) * iw;
  const sy = (y: number) => PAD.t + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * ih;
  const xTicks = props.xTicks ?? [xd[0], xd[0] + (xd[1] - xd[0]) / 2, xd[1]];

  const uniqueX = useMemo(() => [...new Set(allX)].sort((a, b) => a - b), [allX]);

  const onTouch = (e: GestureResponderEvent) => {
    const lx = e.nativeEvent.locationX;
    let best = -1;
    let bd = Infinity;
    uniqueX.forEach((x, i) => {
      const d = Math.abs(sx(x) - lx);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best >= 0 ? uniqueX[best] : null);
  };

  const hoverRows = hover == null ? [] : series.map((s) => ({ s, p: s.points.find((p) => p.x === hover) })).filter((r) => r.p);

  const webHover =
    Platform.OS === 'web'
      ? ({
          onMouseMove: (e: { nativeEvent: { offsetX: number } }) => onTouch({ nativeEvent: { locationX: e.nativeEvent.offsetX } } as GestureResponderEvent),
          onMouseLeave: () => setHover(null),
        } as object)
      : {};

  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && (
        <Pressable onPressIn={onTouch} onPressOut={() => setTimeout(() => setHover(null), 1600)} {...webHover} style={{ flex: 1 }}>
          <Svg width={w} height={height} pointerEvents="none">
            {band ? (
              <Rect x={PAD.l} width={iw} y={sy(Math.min(band.to, yDomain[1]))} height={Math.max(0, sy(Math.max(band.from, yDomain[0])) - sy(Math.min(band.to, yDomain[1])))} fill={colors.normal} opacity={0.07} />
            ) : null}
            {yTicks.map((t) => (
              <G key={t}>
                <Line x1={PAD.l} x2={PAD.l + iw} y1={sy(t)} y2={sy(t)} stroke={colors.hairline} strokeWidth={1} />
                <SvgText x={PAD.l - 8} y={sy(t) + 3.5} fontSize={10} fill={colors.textMuted} textAnchor="end" fontFamily={font.regular}>
                  {formatY(t)}
                </SvgText>
              </G>
            ))}
            {thresholds?.map((th) => (
              <G key={th.label}>
                <Line x1={PAD.l} x2={PAD.l + iw} y1={sy(th.y)} y2={sy(th.y)} stroke={colors.textSecondary} strokeWidth={1} opacity={0.55} />
                <SvgText x={PAD.l + 4} y={sy(th.y) - 5} fontSize={9.5} fill={colors.textSecondary} fontFamily={font.medium}>
                  {th.label}
                </SvgText>
              </G>
            ))}
            {verticals?.map((v) => (
              <G key={v.label + v.x}>
                <Line x1={sx(v.x)} x2={sx(v.x)} y1={PAD.t} y2={PAD.t + ih} stroke={colors.hairlineStrong} strokeWidth={1} />
                <SvgText x={sx(v.x) + 4} y={PAD.t + 9} fontSize={9.5} fill={colors.textMuted} fontFamily={font.medium}>
                  {v.label}
                </SvgText>
              </G>
            ))}
            {xTicks.map((x, i) => (
              <SvgText key={i} x={sx(x)} y={height - 6} fontSize={10} fill={colors.textMuted} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} fontFamily={font.regular}>
                {formatX(x)}
              </SvgText>
            ))}
            {hover != null ? <Line x1={sx(hover)} x2={sx(hover)} y1={PAD.t} y2={PAD.t + ih} stroke={colors.textSecondary} strokeWidth={1} opacity={0.6} /> : null}
            {series.map((s) => {
              let d = '';
              let pen = false;
              for (const p of s.points) {
                if (p.y == null) {
                  pen = false;
                  continue;
                }
                d += `${pen ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`;
                pen = true;
              }
              return (
                <G key={s.id}>
                  <Path d={d} stroke={s.color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '4 5' : undefined} opacity={s.dashed ? 0.75 : 1} />
                  {s.markers !== false &&
                    s.points.map((p, i) =>
                      p.y == null ? (
                        <Circle key={i} cx={sx(p.x)} cy={PAD.t + ih - 1} r={3} stroke={colors.unavailable} strokeWidth={1.2} fill={surface} />
                      ) : (
                        <Circle
                          key={i}
                          cx={sx(p.x)}
                          cy={sy(p.y)}
                          r={hover === p.x ? 5.5 : 4}
                          fill={p.hollow ? surface : (s.markerColor?.(p) ?? s.color)}
                          stroke={p.hollow ? (s.markerColor?.(p) ?? s.color) : surface}
                          strokeWidth={p.hollow ? 1.6 : 2}
                        />
                      ),
                    )}
                </G>
              );
            })}
            {props.endLabels &&
              series.map((s) => {
                const last = [...s.points].reverse().find((p) => p.y != null);
                if (!last || last.y == null) return null;
                return (
                  <G key={s.id + 'lbl'}>
                    <SvgText x={sx(last.x) + 9} y={sy(last.y) + 3.5} fontSize={10.5} fill={colors.text} fontFamily={font.medium}>
                      {s.label}
                    </SvgText>
                  </G>
                );
              })}
          </Svg>
          {hover != null && hoverRows.length ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 4,
                left: Math.min(Math.max(PAD.l, sx(hover) - 70), w - 150),
                width: 140,
                backgroundColor: colors.surfaceRaised,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.hairlineStrong,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <T v="small" style={{ fontSize: 10.5, color: colors.textSecondary }}>{(props.formatTooltipX ?? formatX)(hover)}</T>
              {hoverRows.map(({ s, p }) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <View style={{ width: 8, height: 2, backgroundColor: s.color, marginRight: 6 }} />
                  <T v="small" style={{ fontSize: 11, color: colors.text, flex: 1 }} numberOfLines={1}>
                    {p!.y == null ? 'No usable reading' : `${series.length > 1 ? s.label + '  ' : ''}${formatY(p!.y)}`}
                  </T>
                </View>
              ))}
              {hoverRows.find((r) => r.p?.note) ? <T v="small" style={{ fontSize: 10, marginTop: 3 }}>{hoverRows.find((r) => r.p?.note)!.p!.note}</T> : null}
            </View>
          ) : null}
        </Pressable>
      )}
    </View>
  );
}
