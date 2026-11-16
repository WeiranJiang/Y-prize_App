import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Disclosure from '../../components/Disclosure';
import BottomSheet from '../../components/BottomSheet';
import { replaceEta } from '../../components/StripHealthCard';
import { Button, Card, Divider, Screen, Section, Segmented, StatusDot, T } from '../../components/ui';
import { STATE_COLOR_KEY } from '../../domain/fouling';
import type { Arch } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { colors, space } from '../../theme/tokens';

const PRICE = 9; // demo price per strip (USD)
const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function Stepper({ value, onChange, min = 0, max = 6, label = 'quantity' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} disabled={value <= min} onPress={() => onChange(Math.max(min, value - 1))} style={[styles.step, value <= min && { opacity: 0.35 }]}><T v="bodyStrong">−</T></Pressable>
      <T v="bodyStrong" style={{ minWidth: 18, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{value}</T>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} disabled={value >= max} onPress={() => onChange(Math.min(max, value + 1))} style={[styles.step, value >= max && { opacity: 0.35 }]}><T v="bodyStrong">+</T></Pressable>
    </View>
  );
}

export default function Strips() {
  const { state, dispatch, healthFor, setArch } = useStore();
  const { plan, supply, orders } = state;
  const [qty, setQty] = useState<Record<Arch, number>>({ upper: 2, lower: 2 });
  const [sheet, setSheet] = useState<'delivery' | 'confirm' | null>(null);
  const setPlan = (patch: Partial<typeof plan>) => dispatch({ type: 'plan', patch });
  const pending = orders.find((o) => o.status !== 'delivered');

  // When will spares fall to the reorder point? Current strip's remaining days + spare strips × typical life.
  const LIFE = state.settings.limits.maxDays;
  const daysUntilReorder = Math.min(
    ...(['upper', 'lower'] as Arch[]).map((a) => {
      const h = healthFor(a);
      const left = h.forecast ? Math.min(h.forecast.daysRemaining, L(h)) : L(h);
      return left + Math.max(0, supply[a] - plan.reorderAt) * LIFE;
    }),
  );
  function L(h: ReturnType<typeof healthFor>) {
    return Math.max(0, h.limits.maxDays - h.daysInUse);
  }
  const nextShip = new Date(Date.now() + Math.max(0, daysUntilReorder) * 86400000);
  const low = (['upper', 'lower'] as Arch[]).filter((a) => supply[a] <= plan.reorderAt);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen>
        <View style={{ paddingHorizontal: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><T v="display">Strips</T></View>
        </View>

        {/* Current strips */}
        <Section title="In use">
          <View style={{ gap: 10 }}>
            {(['upper', 'lower'] as Arch[]).map((a) => {
              const h = healthFor(a);
              const key = STATE_COLOR_KEY[h.state];
              return (
                <Card key={a} onPress={() => { setArch(a); router.push('/strip'); }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <T v="bodyStrong">{a === 'upper' ? 'Upper' : 'Lower'} strip</T>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <StatusDot status={key} />
                      <T v="body" style={{ color: colors.text, fontSize: 14 }}>{h.state === 'now' ? 'Replace now' : h.state === 'baseline' ? 'Awaiting readout' : `Replace in ${replaceEta(h).toLowerCase()}`}</T><T v="body">›</T>
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        </Section>

        {/* Supply */}
        <Section title="At home">
          <Card>
            {(['upper', 'lower'] as Arch[]).map((arch, index) => (
              <React.Fragment key={arch}>
                {index ? <Divider /> : null}
                <Row label={`Spare ${arch} strips`}>
                  <Stepper value={supply[arch]} max={99} label={`spare ${arch} strips`} onChange={value => dispatch({ type: 'setSupply', arch, value })} />
                </Row>
              </React.Fragment>
            ))}
          </Card>
          {low.length && plan.mode === 'manual' ? (
            <T v="small" style={{ marginTop: space.sm, color: colors.mild }}>Running low on {low.join(' and ')} strips.</T>
          ) : null}
        </Section>

        <Section title="Delivery" action={<Button label="Manage" compact kind="secondary" onPress={() => setSheet('delivery')} />}>
          <Card>
            <T v="bodyStrong">{plan.mode === 'auto' ? plan.paused ? 'Automatic delivery paused' : 'Automatic delivery' : 'Order when needed'}</T>
            {pending ? <T v="body" style={{ marginTop: space.sm }}>Arrives {fmtDate(pending.eta)}</T> : plan.mode === 'auto' && !plan.paused ? <T v="body" style={{ marginTop: space.sm }}>Next box around {fmtDate(nextShip)}</T> : null}
          </Card>
        </Section>

        {/* Orders */}
        <Section>
          <Disclosure title="Order history">
          <Card style={{ paddingVertical: 4 }}>
            {orders.length === 0 ? (
              <T v="small" style={{ paddingVertical: space.md }}>No orders yet</T>
            ) : (
              orders.map((o, i) => (
                <View key={o.id} style={[styles.order, i > 0 && styles.border]}>
                  <View style={{ flex: 1 }}>
                    <T v="small" style={{ color: colors.text }}>{o.qty.upper} upper · {o.qty.lower} lower</T>
                    <T v="small" style={{ fontSize: 11 }}>{fmtDate(o.placedAt)} · {o.kind === 'auto' ? 'automatic' : 'manual'}</T>
                  </View>
                  <T v="small" style={{ color: o.status === 'delivered' ? colors.textSecondary : colors.text }}>
                    {o.status === 'delivered' ? `Delivered ${fmtDate(o.eta)}` : `Arrives ${fmtDate(o.eta)}`}
                  </T>
                </View>
              ))
            )}
          </Card>
          </Disclosure>
        </Section>
      </Screen>

      <BottomSheet open={sheet !== null} onClose={() => setSheet(null)} maxHeight={0.85}>
        {sheet === 'confirm' ? <>
          <T v="title">Confirm demo order</T>
          <T v="body" style={{ marginTop: space.md }}>{qty.upper} upper + {qty.lower} lower strips · ${(qty.upper + qty.lower) * PRICE}</T>
          <T v="body" style={{ marginTop: space.sm }}>No payment or real shipment.</T>
          <Button label="Place demo order" style={{ marginTop: space.xl }} onPress={() => { dispatch({ type: 'order', qty, kind: 'manual', at: new Date() }); setSheet(null); }} />
          <Button label="Back" kind="ghost" style={{ marginTop: space.sm }} onPress={() => setSheet('delivery')} />
        </> : <>
          <T v="title">Delivery settings</T>
          <View style={{ marginTop: space.lg }}><Segmented fill style={{ paddingHorizontal: 0 }} options={[{ key: 'auto', label: 'Automatic' }, { key: 'manual', label: 'Manual' }]} value={plan.mode} onChange={mode => setPlan({ mode })} /></View>
          <View style={{ marginTop: space.lg }}>
            {plan.mode === 'auto' ? <>
              <Row label="Upper per box"><Stepper label="upper strips per box" value={plan.perBox.upper} onChange={value => setPlan({ perBox: { ...plan.perBox, upper: value } })} /></Row>
              <Row label="Lower per box"><Stepper label="lower strips per box" value={plan.perBox.lower} onChange={value => setPlan({ perBox: { ...plan.perBox, lower: value } })} /></Row>
              <Row label="Reorder at this many spares"><Stepper label="reorder point" value={plan.reorderAt} min={0} max={3} onChange={reorderAt => setPlan({ reorderAt })} /></Row>
              <T v="body" style={{ marginTop: space.md }}>${(plan.perBox.upper + plan.perBox.lower) * PRICE} per box · demo, no charge</T>
              <Button label={plan.paused ? 'Resume deliveries' : 'Pause deliveries'} kind="secondary" style={{ marginTop: space.lg }} onPress={() => setPlan({ paused: !plan.paused })} />
            </> : <>
              <Row label="Upper strips"><Stepper label="upper strips to order" value={qty.upper} onChange={upper => setQty({ ...qty, upper })} /></Row>
              <Row label="Lower strips"><Stepper label="lower strips to order" value={qty.lower} onChange={lower => setQty({ ...qty, lower })} /></Row>
              <T v="body" style={{ marginTop: space.md }}>${(qty.upper + qty.lower) * PRICE} · demo, no charge</T>
              <Button label="Review order" style={{ marginTop: space.lg }} disabled={qty.upper + qty.lower === 0} onPress={() => setSheet('confirm')} />
            </>}
          </View>
          <Button label="Done" kind="ghost" style={{ marginTop: space.md }} onPress={() => setSheet(null)} />
        </>}
      </BottomSheet>
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <T v="small" style={{ color: colors.text, flex: 1, marginRight: space.sm }}>{label}</T>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { width: 44, height: 44, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  order: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
});
