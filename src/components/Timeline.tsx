import React, { useEffect, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { colors, space } from '../theme/tokens';
import Icon from './Icon';
import { Meta, T } from './ui';

/**
 * Drag-to-scrub timeline over scan sessions, with play/pause.
 * `breaks` marks indices where a new strip began.
 */
export default function Timeline({
  count,
  index,
  onChange,
  label,
  breaks = [],
}: {
  count: number;
  index: number;
  onChange: (i: number) => void;
  label: string;
  breaks?: number[];
}) {
  const [w, setW] = useState(1);
  const [playing, setPlaying] = useState(false);
  const wRef = useRef(1);
  wRef.current = w;
  const cb = useRef(onChange);
  cb.current = onChange;
  const n = Math.max(1, count - 1);
  const idxRef = useRef(index);
  idxRef.current = index;

  const pick = (x: number) => cb.current(Math.max(0, Math.min(count - 1, Math.round((x / wRef.current) * n))));
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setPlaying(false);
        pick(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => pick(e.nativeEvent.locationX),
    }),
  ).current;

  useEffect(() => {
    if (!playing) return;
    if (idxRef.current >= count - 1) cb.current(0);
    const id = setInterval(() => {
      if (idxRef.current >= count - 1) {
        setPlaying(false);
        return;
      }
      cb.current(idxRef.current + 1);
    }, 420);
    return () => clearInterval(id);
  }, [playing, count]);

  const x = (index / n) * w;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <T v="small" style={{ color: colors.text, fontVariant: ['tabular-nums'] }}>{label}</T>
        <Meta style={{ fontSize: 11 }}>
          Scan {index + 1} of {count}
        </Meta>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm }}>
        <Pressable onPress={() => setPlaying((p) => !p)} hitSlop={8} style={styles.play} accessibilityLabel={playing ? 'Pause' : 'Play through scans'}>
          <Icon name={playing ? 'pause' : 'play'} size={14} color={colors.text} strokeWidth={1.8} />
        </Pressable>
        <View style={styles.trackWrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Scan timeline">
          <View pointerEvents="none" style={styles.track} />
          <View pointerEvents="none" style={[styles.fill, { width: Math.max(0, x) }]} />
          {Array.from({ length: count }).map((_, i) => (
            <View
              pointerEvents="none"
              key={i}
              style={[styles.tick, { left: (i / n) * w - 0.5 }, breaks.includes(i) && styles.breakTick, i <= index && { backgroundColor: colors.textSecondary }]}
            />
          ))}
          <View pointerEvents="none" style={[styles.thumb, { left: x - 9 }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  play: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised },
  trackWrap: { flex: 1, height: 32, justifyContent: 'center' },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: colors.border },
  fill: { position: 'absolute', left: 0, height: 2, borderRadius: 1, backgroundColor: colors.text },
  tick: { position: 'absolute', top: 12, width: 1, height: 8, backgroundColor: colors.border },
  breakTick: { top: 8, height: 16, backgroundColor: colors.textMuted },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, backgroundColor: colors.text, top: 7 },
});
