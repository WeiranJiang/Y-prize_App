import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { CaseStatus, useStore } from '../state/store';
import { colors } from '../theme/tokens';
import Icon from './Icon';
import { T } from './ui';

const DOT: Record<CaseStatus, string> = {
  connected: colors.normal,
  disconnected: colors.unavailable,
  scanning: colors.accent,
  syncing: colors.accent,
};
const LABEL: Record<CaseStatus, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  scanning: 'Scanning',
  syncing: 'Syncing',
};

/** Scanning-case status. Battery belongs to the case; the strip has none. */
export default function CaseIndicator() {
  const { state } = useStore();
  const pulse = useRef(new Animated.Value(1)).current;
  const busy = state.caseStatus === 'scanning' || state.caseStatus === 'syncing';
  useEffect(() => {
    if (!busy) {
      pulse.setValue(1);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [busy, pulse]);

  return (
    <Pressable onPress={() => router.push('/scan')} style={styles.wrap} accessibilityLabel={`Scanning case ${LABEL[state.caseStatus]}, battery ${Math.round(state.caseBattery * 100)}%. Start a scan.`}>
      <View>
        <Icon name="case" size={22} color={colors.text} />
        <Animated.View style={[styles.dot, { backgroundColor: DOT[state.caseStatus], opacity: pulse }]} />
      </View>
      <View style={{ marginLeft: 8 }}>
        <T v="small" style={{ color: colors.text, fontSize: 11, lineHeight: 13 }}>{LABEL[state.caseStatus]}</T>
        <T v="small" style={{ fontSize: 10, lineHeight: 12 }}>Case {Math.round(state.caseBattery * 100)}%</T>
      </View>
      <View style={{ marginLeft: 10, paddingLeft: 10, borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.hairlineStrong }}>
        <T v="small" style={{ color: colors.text, fontSize: 12 }}>Start scan</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
  dot: { position: 'absolute', right: -2, top: 3, width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: colors.bg },
});
