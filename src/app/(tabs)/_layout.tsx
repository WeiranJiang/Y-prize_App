import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon, { IconName } from '../../components/Icon';
import { colors, font } from '../../theme/tokens';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'trends', label: 'Findings', icon: 'trends' },
  { name: 'overview', label: 'Overview', icon: 'pulse' },
  { name: 'chat', label: 'Ask', icon: 'chat' },
  { name: 'strips', label: 'Strips', icon: 'box' },
];

function TabBar({ state, navigateToTab, insets }: BottomTabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const tab = TABS.find((t) => t.name === route.name);
        if (!tab) return null;
        const on = state.index === i;
        return (
          <Pressable
            key={route.key}
            onPress={() => navigateToTab(route.key)}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
          >
            <Icon name={tab.icon} size={23} color={on ? colors.text : colors.textMuted} strokeWidth={on ? 1.7 : 1.4} />
            <Text style={[styles.label, { color: on ? colors.text : colors.textMuted }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }} tabBar={(p) => <TabBar {...p} />}>
      {TABS.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: Platform.OS === 'web' ? 'rgba(10,10,10,0.96)' : 'rgba(10,10,10,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
    paddingTop: 8,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  item: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 4, paddingTop: 2 },
  indicator: { width: 16, height: 2, borderRadius: 1, marginBottom: 4, backgroundColor: 'transparent' },
  label: { fontFamily: font.family, fontWeight: '500', fontSize: 11, letterSpacing: 0.1 },
});
