import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Card, IconButton, Screen, Section, T } from '../components/ui';
import { BIOMARKER_ORDER, BIOMARKERS } from '../domain/biomarkers';
import { colors, space } from '../theme/tokens';

export default function About() {
  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg }}>
        <IconButton name="chevronLeft" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
        <T v="display" style={{ fontSize: 30, marginTop: space.lg }}>How findings are made</T>
        <T v="body" style={{ marginTop: space.md }}>
          SPOT measures local oral chemistry with microscopic optical transmitters on a thin strip in your retainer. The scanning case reads them optically. Every insight comes from a transparent rule, not a black-box model.
        </T>
      </View>

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
          Coloured areas cover only the footprint each sensor actually samples. Areas between sensors stay neutral; they are not estimated. A dotted ring marks the edge of each measured area. Grey with a ring means the site was configured but its reading was withheld.
        </T>
      </Section>

      <Section title="Limits of each measurement">
        {BIOMARKER_ORDER.map((id) => {
          const b = BIOMARKERS[id];
          return (
            <View key={id} style={{ marginBottom: space.lg }}>
              <T v="bodyStrong">{b.name} <T v="small">· {b.support === 'active' ? 'measured by your strip' : b.support === 'research' ? 'in research' : 'planned'}</T></T>
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
