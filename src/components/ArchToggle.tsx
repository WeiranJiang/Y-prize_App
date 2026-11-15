import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Arch } from '../domain/teeth';
import { useStore } from '../state/store';
import { colors, font } from '../theme/tokens';

/** Upper / Lower switch. Applies to every screen. */
export default function ArchToggle({ onChange }: { onChange?: (a: Arch) => void }) {
  const { arch, setArch } = useStore();
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {(['upper', 'lower'] as Arch[]).map((a) => {
        const on = a === arch;
        return (
          <Pressable
            key={a}
            onPress={() => {
              setArch(a);
              onChange?.(a);
            }}
            style={[styles.btn, on && styles.on]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.text, on && { color: colors.text }]}>{a === 'upper' ? 'Upper' : 'Lower'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignSelf: 'flex-start' },
  btn: { minWidth: 72, paddingHorizontal: 14, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.surfaceRaised },
  text: { fontFamily: font.family, fontWeight: '500', fontSize: 13, color: colors.textSecondary },
});
