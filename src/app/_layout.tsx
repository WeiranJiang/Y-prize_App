import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FoodLogProvider } from '../state/foodLog';
import { StoreProvider } from '../state/store';
import { colors } from '../theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <FoodLogProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'default' }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        </FoodLogProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
