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
            <Text style={[styles.text, on && { color: colors.textOnLight }]}>{a === 'upper' ? 'Upper teeth' : 'Lower teeth'}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', padding: 3, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, alignSelf: 'flex-start' },
  btn: { paddingHorizontal: 14, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: colors.ivory },
  text: { fontFamily: font.medium, fontSize: 13, color: colors.text },
});
