import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import StripHealthCard from '../../components/StripHealthCard';
import { Card, DemoBadge, Divider, Row, Screen, Section, Segmented, T } from '../../components/ui';
import { useStore } from '../../state/store';
import { colors, space } from '../../theme/tokens';

function Step({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.step}>
      <T v="small" style={{ color: colors.text, flex: 1 }}>{label}</T>
      <Pressable onPress={onMinus} hitSlop={8} style={styles.stepBtn}><T v="bodyStrong">−</T></Pressable>
      <T v="small" style={{ color: colors.text, width: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{value}</T>
      <Pressable onPress={onPlus} hitSlop={8} style={styles.stepBtn}><T v="bodyStrong">+</T></Pressable>
    </View>
  );
}

export default function Profile() {
  const { state, dispatch, strip } = useStore();
  const s = state.settings;
  const L = s.limits;
  const B = s.pHBands;
  const setL = (patch: Partial<typeof L>) => dispatch({ type: 'settings', patch: { limits: { ...L, ...patch } } });
  const setB = (patch: Partial<typeof B>) => dispatch({ type: 'settings', patch: { pHBands: { ...B, ...patch } } });
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const r2 = (x: number) => Math.round(x * 100) / 100;

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <T v="display" style={{ fontSize: 30 }}>Profile</T>
          <T v="small" style={{ marginTop: 2 }}>Alex · Upper retainer</T>
        </View>
        <DemoBadge />
      </View>

      <Section title="Devices">
        <Card style={{ paddingVertical: 4 }}>
          <Row label="Scanning case" sub={`${state.caseStatus[0].toUpperCase()}${state.caseStatus.slice(1)} · firmware 0.9.4 (demo)`} value={`${Math.round(state.caseBattery * 100)}%`} />
          <Divider />
          <Row label="Sensing strip" sub={`${strip.id} · batch ${strip.batch} · ${strip.calibrationVersion}`} value="No battery" onPress={() => router.push('/strip')} />
        </Card>
        <View style={{ marginTop: space.md }}>
          <StripHealthCard compact />
        </View>
      </Section>

      <Section title="Display">
        <T v="small" style={{ marginBottom: 8 }}>Tooth numbering</T>
        <Segmented style={{ paddingHorizontal: 0 }} options={[{ key: 'universal', label: 'Universal (1–32)' }, { key: 'fdi', label: 'FDI (11–48)' }]} value={s.numbering} onChange={(k) => dispatch({ type: 'settings', patch: { numbering: k } })} />
        <T v="small" style={{ marginVertical: 8, marginTop: space.lg }}>Detail level</T>
        <Segmented style={{ paddingHorizontal: 0 }} options={[{ key: 'consumer', label: 'Consumer' }, { key: 'research', label: 'Research / clinical' }]} value={s.view} onChange={(k) => dispatch({ type: 'settings', patch: { view: k } })} />
      </Section>

      <Section title="Measurement protocol">
        <Card>
          <Step label="Wear timer" value={`${s.protocol.sessionMinutes} min`} onMinus={() => dispatch({ type: 'settings', patch: { protocol: { ...s.protocol, sessionMinutes: Math.max(1, s.protocol.sessionMinutes - 1) } } })} onPlus={() => dispatch({ type: 'settings', patch: { protocol: { ...s.protocol, sessionMinutes: s.protocol.sessionMinutes + 1 } } })} />
          <Step label="Readout window" value={`${s.protocol.readoutWindowMin} min`} onMinus={() => dispatch({ type: 'settings', patch: { protocol: { ...s.protocol, readoutWindowMin: Math.max(1, s.protocol.readoutWindowMin - 1) } } })} onPlus={() => dispatch({ type: 'settings', patch: { protocol: { ...s.protocol, readoutWindowMin: s.protocol.readoutWindowMin + 1 } } })} />
          <T v="small" style={{ marginTop: space.sm }}>Engineering / demo protocol. Durations are not clinically validated.</T>
        </Card>
      </Section>

      <Section title="Research thresholds · pH">
        <Card>
          <Step label="Mild below" value={B.mild.toFixed(1)} onMinus={() => setB({ mild: r1(Math.max(B.elevated + 0.1, B.mild - 0.1)) })} onPlus={() => setB({ mild: r1(B.mild + 0.1) })} />
          <Step label="Elevated below" value={B.elevated.toFixed(1)} onMinus={() => setB({ elevated: r1(Math.max(B.high + 0.1, B.elevated - 0.1)) })} onPlus={() => setB({ elevated: r1(Math.min(B.mild - 0.1, B.elevated + 0.1)) })} />
          <Step label="High concern below" value={B.high.toFixed(1)} onMinus={() => setB({ high: r1(B.high - 0.1) })} onPlus={() => setB({ high: r1(Math.min(B.elevated - 0.1, B.high + 0.1)) })} />
          <T v="small" style={{ marginTop: space.sm }}>Changing a threshold recolours the map and re-runs every rule.</T>
        </Card>
      </Section>

      <Section title="Strip replacement limits">
        <Card>
          <Step label="Replace below clarity" value={`${Math.round(L.clarityReplace * 100)}%`} onMinus={() => setL({ clarityReplace: r2(Math.max(0.4, L.clarityReplace - 0.01)) })} onPlus={() => setL({ clarityReplace: r2(Math.min(L.claritySoon - 0.01, L.clarityReplace + 0.01)) })} />
          <Step label="Replace soon below" value={`${Math.round(L.claritySoon * 100)}%`} onMinus={() => setL({ claritySoon: r2(Math.max(L.clarityReplace + 0.01, L.claritySoon - 0.01)) })} onPlus={() => setL({ claritySoon: r2(Math.min(0.95, L.claritySoon + 0.01)) })} />
          <Step label="Validated use period" value={`${L.maxDays} days`} onMinus={() => setL({ maxDays: Math.max(1, L.maxDays - 1) })} onPlus={() => setL({ maxDays: L.maxDays + 1 })} />
          <Step label="Max sessions" value={`${L.maxSessions}`} onMinus={() => setL({ maxSessions: Math.max(1, L.maxSessions - 1) })} onPlus={() => setL({ maxSessions: L.maxSessions + 1 })} />
          <Step label="Min usable sites" value={`${Math.round(L.usableMin * 100)}%`} onMinus={() => setL({ usableMin: r2(Math.max(0.5, L.usableMin - 0.05)) })} onPlus={() => setL({ usableMin: r2(Math.min(1, L.usableMin + 0.05)) })} />
        </Card>
      </Section>

      <Section title="About">
        <Card style={{ paddingVertical: 4 }}>
          <Row label="How findings are made" sub="Rules, limitations and what the map shows" onPress={() => router.push('/about')} />
          <Divider />
          <Row label="Reset demo data" sub="Restore the original 4-week demo history" onPress={() => dispatch({ type: 'reset' })} />
        </Card>
        <T v="small" style={{ marginTop: space.lg, color: colors.textMuted }}>
          SPOT (Submillimeter Polymer Optical Transmitter) research prototype · University of Pennsylvania. Not a medical device. All data shown is simulated.
        </T>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
});
