import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { siteTitle } from '../domain/analysis';
import { BIOMARKERS, formatValue, STATUS_RANK, unitSuffix } from '../domain/biomarkers';
import { toothByUniversal, toothNumber } from '../domain/teeth';
import { useStore } from '../state/store';
import RetainerView from '../three/RetainerView';
import { Region, STATUS_HEX } from '../three/regions';
import { colors, space } from '../theme/tokens';
import Icon from './Icon';
import { Button, T } from './ui';

const ND = Platform.OS !== 'web';
const SIZE = 248;

/**
 * Magnifier: a circular, zoomed-in view of one tooth that pops out over the
 * Home screen, with that tooth's readings underneath.
 */
export default function Loupe({ tooth, regions, onClose }: { tooth: number | null; regions: Region[]; onClose: () => void }) {
  const { analysis, arch, state } = useStore();
  const scale = useRef(new Animated.Value(0.6)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const open = tooth != null;

  useEffect(() => {
    if (!open) return;
    scale.setValue(0.6);
    fade.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, damping: 16, stiffness: 180, mass: 0.8, useNativeDriver: ND }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: ND }),
    ]).start();
  }, [open, tooth, scale, fade]);

  const rows = useMemo(
    () =>
      (analysis?.results ?? [])
        .filter((r) => r.site.toothUniversal === tooth)
        .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]),
    [analysis, tooth],
  );
  if (!open || tooth == null) return null;
  const t = toothByUniversal(tooth);
  const numbering = state.settings.numbering;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale }] }}>
          <View style={styles.lens}>
            <RetainerView
              key={`${arch}-${tooth}`}
              arch={arch}
              style={{ width: SIZE, height: SIZE }}
              regions={regions}
              selectedTooth={tooth}
              focusTooth={tooth}
              autoRotate={false}
              zoom={0.62}
            />
            <View pointerEvents="none" style={styles.glass} />
          </View>

          <View style={styles.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ fontSize: 10 }}>{toothNumber(t, numbering)}</T>
                <T v="heading" style={{ marginTop: 2 }}>{t.name}</T>
              </View>
              <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
                <Icon name="close" size={16} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 210, marginTop: space.md }} showsVerticalScrollIndicator={false}>
              {rows.length === 0 ? (
                <T v="small">No sensor on this tooth. Nearby readings are not estimated here.</T>
              ) : (
                rows.map((r) => {
                  const b = BIOMARKERS[r.site.biomarker];
                  const concern = r.status !== 'normal' && r.status !== 'unavailable';
                  return (
                    <View key={r.site.id} style={styles.row}>
                      <View style={[styles.dot, { backgroundColor: concern ? STATUS_HEX[r.status] : r.status === 'unavailable' ? 'transparent' : colors.point }, r.status === 'unavailable' && styles.dashed]} />
                      <T v="small" style={{ flex: 1, color: colors.text }} numberOfLines={1}>
                        {b.shortName} <T v="small">· {siteTitle(r.site).surface.toLowerCase()}</T>
                      </T>
                      <T v="small" style={{ color: colors.text, fontVariant: ['tabular-nums'] }}>
                        {r.reading.value == null ? '—' : `${formatValue(b, r.reading.value)}${unitSuffix(b)}`}
                      </T>
                      <T v="small" style={{ width: 92, textAlign: 'right', fontSize: 11 }} numberOfLines={1}>
                        {r.status === 'unavailable' ? 'Not measured' : r.status === 'normal' ? 'In range' : b.statusWords[r.status]}
                      </T>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <Button compact label="Tooth details" style={{ flex: 1 }} onPress={() => { onClose(); router.push({ pathname: '/tooth', params: { u: String(tooth) } }); }} />
              <Button compact kind="secondary" label="Trends" style={{ flex: 1 }} onPress={() => { onClose(); router.navigate({ pathname: '/trends', params: { tooth: String(tooth) } }); }} />
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.78)' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  lens: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    overflow: 'hidden',
    backgroundColor: colors.bg,
    borderWidth: 1.5,
    borderColor: '#3A3A3A',
  },
  glass: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: SIZE / 2, borderWidth: 6, borderColor: 'rgba(255,255,255,0.04)' },
  card: {
    width: 320,
    maxWidth: '100%',
    marginTop: space.lg,
    padding: space.lg,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dashed: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.unavailable },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: space.md, paddingVertical: 10, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
});
