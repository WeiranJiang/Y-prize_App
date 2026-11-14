import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/layouts/Tabs';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon, { IconName } from '../../components/Icon';
import { colors, font } from '../../theme/tokens';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'scan', label: 'Scan', icon: 'scan' },
  { name: 'explore', label: 'Explore', icon: 'explore' },
  { name: 'trends', label: 'Trends', icon: 'trends' },
  { name: 'profile', label: 'Profile', icon: 'profile' },
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
            <View style={[styles.indicator, on && { backgroundColor: colors.text }]} />
            <Icon name={tab.icon} size={22} color={on ? colors.text : colors.textMuted} strokeWidth={on ? 1.6 : 1.3} />
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
    backgroundColor: Platform.OS === 'web' ? 'rgba(5,6,27,0.94)' : 'rgba(5,6,27,0.97)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairlineStrong,
    paddingTop: 8,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  indicator: { width: 16, height: 2, borderRadius: 1, marginBottom: 4, backgroundColor: 'transparent' },
  label: { fontFamily: font.medium, fontSize: 10, letterSpacing: 0.3 },
});
