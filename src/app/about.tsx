import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Card, IconButton, Legend, Screen, Section, T } from '../components/ui';
import { BIOMARKER_ORDER, BIOMARKERS } from '../domain/biomarkers';
import { colors, space } from '../theme/tokens';

export default function About() {
  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><IconButton name="chevronLeft" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} /></View>
        <T v="display" style={{ fontSize: 30, marginTop: space.lg }}>How findings are made</T>
        <T v="body" style={{ marginTop: space.md }}>
          OraCare brings the SPOT sensing system’s readings into one place, helping you understand local oral chemistry and how it changes over time. It is a research prototype, not a medical device. All readings in this demo are simulated.
        </T>
      </View>

      <Section title="From retainer to readings">
        <Card>
          <T v="bodyStrong">1. A strip samples specific locations</T>
          <T v="small" style={{ marginTop: 4 }}>Microscopic optical transmitters sit on a thin sensing strip in your retainer. Each sensing site measures one aspect of the chemistry nearby; it does not measure every tooth or your whole mouth.</T>
          <T v="bodyStrong" style={{ marginTop: space.lg }}>2. The case reads the strip</T>
          <T v="small" style={{ marginTop: 4 }}>The system is designed for automatic readouts in the scanning case, with no scan button in the app. This demo uses sample history; live hardware syncing is not connected yet.</T>
          <T v="bodyStrong" style={{ marginTop: space.lg }}>3. The app puts the results in context</T>
          <T v="small" style={{ marginTop: 4 }}>Findings use predefined rules to compare readings with configurable research ranges, check signal quality and highlight repeated patterns. The Ask guide can explain readings and general oral care; its answers are separate from those measurement rules.</T>
        </Card>
      </Section>

      <Section title="Three kinds of information">
        <Card>
          <T v="bodyStrong">Observed</T>
          <T v="small" style={{ marginTop: 4 }}>What a sensor measured, with its uncertainty and quality.</T>
          <T v="bodyStrong" style={{ marginTop: space.md }}>Interpreted</T>
          <T v="small" style={{ marginTop: 4 }}>What that measurement may suggest, in plain language. Never a diagnosis.</T>
          <T v="bodyStrong" style={{ marginTop: space.md }}>Recommended</T>
          <T v="small" style={{ marginTop: 4 }}>A practical, low-risk action, and when to talk to a dentist.</T>
        </Card>
      </Section>

      <Section title="What the map shows">
        <T v="body">
          On the 3D map, coloured areas cover only the footprint each sensor samples. Areas between sensors stay neutral; they are not estimated. The tooth chart summarises available readings for each monitored tooth. Grey or dashed markers indicate a reading was not measured reliably—not that the tooth is healthy.
        </T>
      </Section>

      <View style={{ marginTop: space.md }}><Legend /></View>

      <Section title="Reading the bigger picture">
        <Card>
          <T v="bodyStrong">A percentage is not a dental health score</T>
          <T v="small" style={{ marginTop: 4 }}>“Readings in range” describes the available measured sites in your chosen dates. Unmeasured areas are not counted as healthy. A reassuring reading cannot rule out a dental problem.</T>
          <T v="bodyStrong" style={{ marginTop: space.lg }}>Patterns matter more than a single number</T>
          <T v="small" style={{ marginTop: 4 }}>Meals, drinks, readout timing and strip condition can affect results. Findings lets you compare the same location over time. Overview’s activity calendar shows when sessions were recorded, not whether your teeth were healthy that day.</T>
          <T v="bodyStrong" style={{ marginTop: space.lg }}>Strip clarity is a separate signal</T>
          <T v="small" style={{ marginTop: 4 }}>Reference spots help track film on the strip. As clarity falls, readings can become less reliable. Results below the signal-quality floor are withheld rather than guessed; the Strips tab explains replacement timing.</T>
        </Card>
      </Section>

      <Section title="Limits of each measurement">
        {BIOMARKER_ORDER.map((id) => {
          const b = BIOMARKERS[id];
          return (
            <View key={id} style={{ marginBottom: space.lg }}>
              <T v="bodyStrong">{b.name} <T v="small">· {b.support === 'active' ? 'simulated in this demo' : b.support === 'research' ? 'in research' : 'planned'}</T></T>
              <T v="small" style={{ marginTop: 4 }}>{b.what} {b.limitation}</T>
            </View>
          );
        })}
        <T v="small" style={{ color: colors.textMuted }}>
          Localised pH, lactate and mineral-ion measurements are research indicators. They do not independently diagnose dental decay or gum disease. Talk to a dental professional about any persistent finding, pain, sensitivity or bleeding.
        </T>
      </Section>
    </Screen>
  );
}
