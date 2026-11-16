import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme/tokens';

const ND = Platform.OS !== 'web';

/** A light, draggable bottom sheet that rises over the current screen. */
export default function BottomSheet({ open, onClose, children, maxHeight = 0.58 }: { open: boolean; onClose: () => void; children: React.ReactNode; maxHeight?: number }) {
  const H = Dimensions.get('window').height;
  const y = useRef(new Animated.Value(H)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const insets = useSafeAreaInsets();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(y, { toValue: 0, useNativeDriver: ND, damping: 26, stiffness: 220, mass: 0.9 }),
        Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: ND }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(y, { toValue: H, duration: 260, useNativeDriver: ND }),
        Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: ND }),
      ]).start(() => setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 0.9) closeRef.current();
        else Animated.spring(y, { toValue: 0, useNativeDriver: ND, damping: 24, stiffness: 240 }).start();
      },
    }),
  ).current;

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)', opacity: fade }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.sheet, { maxHeight: H * maxHeight, paddingBottom: insets.bottom + 16, transform: [{ translateY: y }] }]}>
        <View {...pan.panHandlers} style={styles.grabArea}>
          <View style={styles.grab} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 12 }}>
          {children}
        </ScrollView>
      </Animated.View>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  grabArea: { alignItems: 'center', paddingTop: 10, paddingBottom: 14 },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#3A3A3A' },
});
