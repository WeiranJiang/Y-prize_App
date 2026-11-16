import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { colors, space } from '../theme/tokens';
import Icon from './Icon';
import { T } from './ui';

/** Keep optional detail available without competing with the main task. */
export default function Disclosure({ title, summary, children, initiallyOpen = false }: {
  title: string;
  summary?: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View>
      <Pressable onPress={() => setOpen(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm }}>
        <View style={{ flex: 1 }}>
          <T v="bodyStrong" style={{ fontSize: 15 }}>{title}</T>
          {summary && !open ? <T v="small" style={{ marginTop: 3 }}>{summary}</T> : null}
        </View>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>
      {open ? <View style={{ paddingBottom: space.sm }}>{children}</View> : null}
    </View>
  );
}
