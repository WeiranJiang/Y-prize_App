import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Status } from '../domain/biomarkers';
import { colors } from '../theme/tokens';
import { StatusDot, T } from './ui';

/** Compact label pinned to a 3D region; position is driven from the render loop. */
export default function FloatingLabel({ pos, title, value, status }: { pos: Animated.ValueXY; title: string; value?: string; status: Status }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        { transform: [{ translateX: Animated.add(pos.x, new Animated.Value(-80)) }, { translateY: Animated.add(pos.y, new Animated.Value(-62)) }] },
      ]}
    >
      <View style={styles.box}>
        <StatusDot status={status} size={7} />
        <View style={{ marginLeft: 7, flexShrink: 1 }}>
          <T v="small" style={{ color: colors.text, fontSize: 11.5, lineHeight: 14 }} numberOfLines={1}>{title}</T>
          {value ? <T v="small" style={{ fontSize: 11, lineHeight: 14 }} numberOfLines={1}>{value}</T> : null}
        </View>
      </View>
      <View style={styles.stem} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, width: 160, alignItems: 'center' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#242424',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    maxWidth: 160,
  },
  stem: { width: 1, height: 18, backgroundColor: 'rgba(247,248,252,0.5)' },
});
