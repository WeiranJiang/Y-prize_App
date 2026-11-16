import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, space } from '../theme/tokens';
import Icon from './Icon';
import { T } from './ui';

/** Keep optional detail available without competing with the main task. */
export default function Disclosure({ title, children, initiallyOpen = false }: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable onPress={() => setOpen(value => !value)} accessibilityRole="button" accessibilityLabel={`${open ? 'Hide' : 'Show'} ${title}`} accessibilityState={{ expanded: open }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.bg2 }}>
        <T v="bodyStrong" style={{ flex: 1, fontSize: 15 }}>{title}</T>
        <T v="small" style={{ color: colors.text, fontSize: 12 }}>{open ? 'Hide' : 'Show'}</T>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}>
          <Icon name="chevron" size={16} color={colors.text} />
        </View>
      </Pressable>
      {open ? <View style={{ paddingTop: space.md, paddingBottom: space.sm }}>{children}</View> : null}
    </View>
  );
}
