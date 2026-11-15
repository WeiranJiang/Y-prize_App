import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme/tokens';

/**
 * Two-handle range slider over discrete steps (scan sessions).
 * Drag a handle to move one end, or drag inside the selection to slide the
 * whole window. `breaks` marks steps where a new strip began.
 */
export default function RangeSlider({
  count,
  value,
  onChange,
  breaks = [],
}: {
  count: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  breaks?: number[];
}) {
  const [w, setW] = useState(1);
  const st = useRef({ w: 1, value, mode: 'start' as 'start' | 'end' | 'window', grabIdx: 0, orig: value });
  st.current.w = w;
  st.current.value = value;
  const cb = useRef(onChange);
  cb.current = onChange;
  const n = Math.max(1, count - 1);
  const toIdx = (x: number) => Math.max(0, Math.min(count - 1, Math.round((x / st.current.w) * n)));

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const x = e.nativeEvent.locationX;
        const [a, b] = st.current.value;
        const xa = (a / n) * st.current.w;
        const xb = (b / n) * st.current.w;
        const da = Math.abs(x - xa);
        const db = Math.abs(x - xb);
        st.current.orig = [a, b];
        st.current.grabIdx = toIdx(x);
        if (Math.min(da, db) < 22) st.current.mode = da <= db ? 'start' : 'end';
        else if (x > xa && x < xb) st.current.mode = 'window';
        else st.current.mode = x < xa ? 'start' : 'end';
        if (st.current.mode !== 'window') move(x);
      },
      onPanResponderMove: (e) => move(e.nativeEvent.locationX),
    }),
  ).current;

  function move(x: number) {
    const i = toIdx(x);
    const [a, b] = st.current.value;
    if (st.current.mode === 'start') cb.current([Math.min(i, b), b]);
    else if (st.current.mode === 'end') cb.current([a, Math.max(i, a)]);
    else {
      const [oa, ob] = st.current.orig;
      const d = Math.max(-oa, Math.min(count - 1 - ob, i - st.current.grabIdx));
      cb.current([oa + d, ob + d]);
    }
  }

  const xa = (value[0] / n) * w;
  const xb = (value[1] / n) * w;
  return (
    <View style={styles.wrap} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Time range">
      <View pointerEvents="none" style={styles.track} />
      {Array.from({ length: count }).map((_, i) => (
        <View
          pointerEvents="none"
          key={i}
          style={[styles.tick, { left: (i / n) * w - 0.5 }, breaks.includes(i) && styles.breakTick, i >= value[0] && i <= value[1] && { backgroundColor: colors.textSecondary }]}
        />
      ))}
      <View pointerEvents="none" style={[styles.sel, { left: xa, width: Math.max(2, xb - xa) }]} />
      <View pointerEvents="none" style={[styles.thumb, { left: xa - 10 }]}>
        <View style={styles.grip} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: xb - 10 }]}>
        <View style={styles.grip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 40, justifyContent: 'center', marginHorizontal: 10 },
  track: { position: 'absolute', left: 0, right: 0, height: 2, borderRadius: 1, backgroundColor: colors.border },
  sel: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: colors.text, top: 18 },
  tick: { position: 'absolute', top: 26, width: 1, height: 6, backgroundColor: colors.border },
  breakTick: { top: 24, height: 10, backgroundColor: colors.textMuted },
  thumb: { position: 'absolute', top: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  grip: { width: 6, height: 1.5, backgroundColor: colors.textOnLight, borderRadius: 1 },
});
