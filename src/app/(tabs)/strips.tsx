import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Disclosure from '../../components/Disclosure';
import BottomSheet from '../../components/BottomSheet';
import { replaceEta } from '../../components/StripHealthCard';
import { Button, Card, Divider, Meter, Screen, Section, Segmented, StatusDot, T } from '../../components/ui';
import { pct, STATE_COLOR_KEY } from '../../domain/fouling';
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
  const [confirm, setConfirm] = useState(false);
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
          <T v="small" style={{ marginTop: 2 }}>Your sensing strips and deliveries</T>
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
                      <T v="small" style={{ color: colors.text }}>{h.state === 'now' ? 'Replace now' : `Replace in ${replaceEta(h).toLowerCase()}`}</T>
                    </View>
                  </View>
                  <View style={{ marginTop: space.md }}>
                    <Meter value={h.clarity ?? 1} status={key} marks={[h.limits.clarityReplace]} />
                  </View>
                  <T v="small" style={{ marginTop: 6, fontSize: 11 }}>Clarity {h.clarity != null ? pct(h.clarity) : '—'} · day {Math.floor(h.daysInUse) + 1} of {h.limits.maxDays}</T>
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

        {/* Delivery */}
        <Section title="Delivery">
          <Segmented
            style={{ paddingHorizontal: 0 }}
            options={[{ key: 'auto', label: 'Automatic' }, { key: 'manual', label: 'Manual' }]}
            value={plan.mode}
            onChange={(k) => setPlan({ mode: k })}
          />
          {plan.mode === 'auto' ? (
            <Card style={{ marginTop: space.md }}>
              <T v="small">{plan.paused ? 'Paused' : pending ? 'On its way' : 'Next box ships'}</T>
              <T v="title" style={{ marginTop: 4 }}>
                {plan.paused ? 'No deliveries' : pending ? `Arrives ${fmtDate(pending.eta)}` : `Around ${fmtDate(nextShip)}`}
              </T>
              <T v="small" style={{ marginTop: 4, fontSize: 12 }}>We ship when you’re down to {plan.reorderAt} spare, based on how fast your strips wear.</T>
              <Divider style={{ marginVertical: space.lg }} />
              <Disclosure title="Delivery settings" summary={`${plan.perBox.upper} upper + ${plan.perBox.lower} lower per box`}>
              <Row label="Upper per box"><Stepper value={plan.perBox.upper} onChange={(v) => setPlan({ perBox: { ...plan.perBox, upper: v } })} /></Row>
              <Row label="Lower per box"><Stepper value={plan.perBox.lower} onChange={(v) => setPlan({ perBox: { ...plan.perBox, lower: v } })} /></Row>
              <Row label="Ship when spares reach"><Stepper value={plan.reorderAt} min={0} max={3} onChange={(v) => setPlan({ reorderAt: v })} /></Row>
              </Disclosure>
              <Divider style={{ marginVertical: space.md }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <T v="small">${(plan.perBox.upper + plan.perBox.lower) * PRICE} per box · demo, no charge</T>
                <Pressable onPress={() => setPlan({ paused: !plan.paused })} style={styles.pill}>
                  <T v="small" style={{ color: colors.text }}>{plan.paused ? 'Resume' : 'Pause'}</T>
                </Pressable>
              </View>
            </Card>
          ) : (
            <Card style={{ marginTop: space.md }}>
              <Row label="Upper strips"><Stepper value={qty.upper} onChange={(v) => setQty({ ...qty, upper: v })} /></Row>
              <Row label="Lower strips"><Stepper value={qty.lower} onChange={(v) => setQty({ ...qty, lower: v })} /></Row>
              <Divider style={{ marginVertical: space.md }} />
              <T v="small">${(qty.upper + qty.lower) * PRICE} · arrives in about 3 days · demo, no charge</T>
              <Button label="Create demo order" style={{ marginTop: space.lg }} disabled={qty.upper + qty.lower === 0} onPress={() => setConfirm(true)} />
            </Card>
          )}
        </Section>

        {/* Orders */}
        <Section>
          <Disclosure title="Order history" summary={`${orders.length} demo order${orders.length === 1 ? '' : 's'}`}>
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
          <T v="small" style={{ marginTop: space.md, color: colors.textMuted, fontSize: 11 }}>Demo only. No real orders or payments are made.</T>
        </Section>
      </Screen>

      <BottomSheet open={confirm} onClose={() => setConfirm(false)}>
        <T v="title">Confirm demo order</T>
        <T v="body" style={{ marginTop: space.md }}>{qty.upper} upper and {qty.lower} lower strips · ${(qty.upper + qty.lower) * PRICE}</T>
        <Button
          label="Place demo order"
          style={{ marginTop: space.xl }}
          onPress={() => {
            dispatch({ type: 'order', qty, kind: 'manual', at: new Date() });
            setConfirm(false);
          }}
        />
        <Button label="Cancel" kind="ghost" style={{ marginTop: space.sm }} onPress={() => setConfirm(false)} />
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
  pill: { paddingHorizontal: 14, minHeight: 44, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  order: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  border: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
});
