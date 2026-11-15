import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '../state/store';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'default' }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="scan" options={{ animation: 'slide_from_bottom', presentation: 'fullScreenModal' }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
