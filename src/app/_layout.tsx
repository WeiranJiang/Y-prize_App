import { Stack } from 'expo-router';
import Head from 'expo-router/head';
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
        <Head>
          <title>OraCare</title>
          <meta name="description" content="Oral-health readings, food logging and scan history in one place." />
          <meta property="og:title" content="OraCare" />
          <meta property="og:description" content="Oral-health readings, food logging and scan history in one place." />
        </Head>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'default' }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        </FoodLogProvider>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
