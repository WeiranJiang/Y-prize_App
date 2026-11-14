import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { CROWN, toothFrames } from '../domain/arch';
import { Status } from '../domain/biomarkers';
import { NumberingSystem } from '../domain/teeth';
import { STATUS_HEX } from '../three/regions';
import { colors, font } from '../theme/tokens';

/** Occlusal (top-down) arch map. Tap a tooth to select it. */
export default function ArchDiagram({
  statusByTooth,
  selected,
  onSelect,
  numbering,
}: {
  statusByTooth: Map<number, Status>;
  selected: number | null;
  onSelect: (u: number) => void;
  numbering: NumberingSystem;
}) {
  const [w, setW] = useState(0);
  const frames = [...toothFrames().values()].filter((f) => f.tooth.position <= 7);
  const H = 190;
  // Model x ∈ [-40, 40], z ∈ [-26, 22] → screen. Anterior at the top (as on a dental chart).
  const s = Math.min((w - 20) / 84, (H - 20) / 52);
  const cx = w / 2;
  const toX = (x: number) => cx + x * s;
  const toY = (z: number) => 14 + (22 - z) * s;

  return (
    <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {frames.map((f) => {
            const u = f.tooth.universal;
            const c = CROWN[f.tooth.position]!;
            const st = statusByTooth.get(u);
            const on = selected === u;
            const rx = (c.w / 2) * s * 0.92;
            const ry = (c.b / 2) * s * 0.85;
            const ang = (Math.atan2(f.tangent[2], f.tangent[0]) * 180) / Math.PI;
            const X = toX(f.center[0]);
            const Y = toY(f.center[2]);
            const stroke = on ? colors.text : st ? STATUS_HEX[st] : colors.hairlineStrong;
            const label = numbering === 'universal' ? String(u) : String(f.tooth.fdi);
            const lx = X + f.normal[0] * (ry + 11);
            const ly = Y - f.normal[2] * (ry + 11);
            const ellipse = `M${-rx},0 a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
            return (
              <G key={u} onPress={() => onSelect(u)}>
                <G transform={`translate(${X},${Y}) rotate(${-ang})`}>
                  <Path d={ellipse} fill={st && st !== 'unavailable' ? STATUS_HEX[st] : 'transparent'} fillOpacity={on ? 0.32 : 0.14} stroke={stroke} strokeWidth={on ? 1.6 : 1} strokeDasharray={st === 'unavailable' ? '2 2' : undefined} />
                </G>
                {st ? <Circle cx={X} cy={Y} r={2.4} fill={STATUS_HEX[st]} /> : null}
                <SvgText x={lx} y={ly + 3} fontSize={9} textAnchor="middle" fill={on ? colors.text : colors.textMuted} fontFamily={font.medium}>
                  {label}
                </SvgText>
              </G>
            );
          })}
          <SvgText x={cx} y={H - 30} fontSize={9.5} textAnchor="middle" fill={colors.textMuted} fontFamily={font.medium} letterSpacing={1}>
            UPPER ARCH
          </SvgText>
          <SvgText x={10} y={H - 8} fontSize={9.5} fill={colors.textMuted} fontFamily={font.regular}>R</SvgText>
          <SvgText x={w - 10} y={H - 8} fontSize={9.5} textAnchor="end" fill={colors.textMuted} fontFamily={font.regular}>L</SvgText>
        </Svg>
      )}
    </View>
  );
}
