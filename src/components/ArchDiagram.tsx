import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { archFrames, crownFor } from '../domain/arch';
import { Arch, NumberingSystem } from '../domain/teeth';
import { colors, font } from '../theme/tokens';

/** Occlusal (top-down) arch map. Tap a tooth to select it. */
export default function ArchDiagram({
  marks,
  selected,
  onSelect,
  numbering,
  arch = 'upper',
}: {
  arch?: Arch;
  /** Teeth to mark: colour of the most concerning reading; dashed = configured but unmeasured. */
  marks: Map<number, { color: string; dashed?: boolean }>;
  selected: number | null;
  onSelect: (u: number) => void;
  numbering: NumberingSystem;
}) {
  const [w, setW] = useState(0);
  const frames = archFrames(arch).filter((f) => f.tooth.position <= 7);
  // Upper: anterior at the top (as on a dental chart). Lower: anterior at the bottom.
  const flip = arch === 'lower';
  const H = 190;
  // Model x ∈ [-40, 40], z ∈ [-26, 22] → screen. Anterior at the top (as on a dental chart).
  const s = Math.min((w - 20) / 84, (H - 20) / 52);
  const cx = w / 2;
  const toX = (x: number) => cx + x * s;
  const toY = (z: number) => (flip ? H - 34 - (22 - z) * s : 14 + (22 - z) * s);

  return (
    <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Svg width={w} height={H}>
          {frames.map((f) => {
            const u = f.tooth.universal;
            const c = crownFor(arch, f.tooth.position);
            const m = marks.get(u);
            const on = selected === u;
            const rx = (c.w / 2) * s * 0.92;
            const ry = (c.b / 2) * s * 0.85;
            const ang = ((Math.atan2(f.tangent[2], f.tangent[0]) * 180) / Math.PI) * (flip ? -1 : 1);
            const X = toX(f.center[0]);
            const Y = toY(f.center[2]);
            const stroke = on ? colors.text : m ? m.color : colors.hairlineStrong;
            const label = numbering === 'universal' ? String(u) : String(f.tooth.fdi);
            const lx = X + f.normal[0] * (ry + 11);
            const ly = Y - f.normal[2] * (ry + 11) * (flip ? -1 : 1);
            const ellipse = `M${-rx},0 a${rx},${ry} 0 1,0 ${rx * 2},0 a${rx},${ry} 0 1,0 ${-rx * 2},0`;
            return (
              <G key={u} onPress={() => onSelect(u)}>
                <G transform={`translate(${X},${Y}) rotate(${-ang})`}>
                  <Path d={ellipse} fill={m && !m.dashed ? m.color : 'transparent'} fillOpacity={on ? 0.36 : 0.18} stroke={stroke} strokeWidth={on ? 1.6 : 1} strokeDasharray={m?.dashed ? '2 2' : undefined} />
                </G>
                {m && !m.dashed ? <Circle cx={X} cy={Y} r={2.4} fill={m.color} /> : null}
                <SvgText x={lx} y={ly + 3} fontSize={9} textAnchor="middle" fill={on ? colors.text : colors.textMuted} fontFamily={font.family} fontWeight="500">
                  {label}
                </SvgText>
              </G>
            );
          })}
          <SvgText x={cx} y={flip ? 34 : H - 30} fontSize={9.5} textAnchor="middle" fill={colors.textMuted} fontFamily={font.family} fontWeight="500" letterSpacing={1}>
            {flip ? 'LOWER ARCH' : 'UPPER ARCH'}
          </SvgText>
          <SvgText x={10} y={H - 8} fontSize={9.5} fill={colors.textMuted} fontFamily={font.family} fontWeight="400">R</SvgText>
          <SvgText x={w - 10} y={H - 8} fontSize={9.5} textAnchor="end" fill={colors.textMuted} fontFamily={font.family} fontWeight="400">L</SvgText>
        </Svg>
      )}
    </View>
  );
}
