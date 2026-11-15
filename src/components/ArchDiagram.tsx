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
  const H = Math.max(260, Math.min(340, w * 0.85));
  // Fit the actual crowns rather than assumed arch dimensions. Leave room
  // outside every crown for tooth numbers, strokes and the card border.
  const bounds = frames.map(f => {
    const c = crownFor(arch, f.tooth.position);
    const radius = Math.max(c.w * 0.46, c.b * 0.425);
    return { x: f.center[0], z: f.center[2], radius };
  });
  const minX = Math.min(...bounds.map(b => b.x - b.radius));
  const maxX = Math.max(...bounds.map(b => b.x + b.radius));
  const minZ = Math.min(...bounds.map(b => b.z - b.radius));
  const maxZ = Math.max(...bounds.map(b => b.z + b.radius));
  const padding = 28;
  const s = Math.max(0, Math.min((w - padding * 2) / (maxX - minX), (H - padding * 2) / (maxZ - minZ)));
  const cx = w / 2;
  const midZ = (minZ + maxZ) / 2;
  const toX = (x: number) => cx + (x - (minX + maxX) / 2) * s;
  const toY = (z: number) => H / 2 + (flip ? 1 : -1) * (z - midZ) * s;

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
