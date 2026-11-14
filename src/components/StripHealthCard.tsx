import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { pct, STATE_COLOR_KEY } from '../domain/fouling';
import { useStore } from '../state/store';
import { colors, space } from '../theme/tokens';
import Icon from './Icon';
import { Card, Meter, StatusDot, T } from './ui';

const STATE_WORD = { baseline: 'Baseline pending', good: 'Good', monitor: 'Monitor', soon: 'Replace soon', now: 'Replace now' } as const;

export function replaceEta(h: ReturnType<typeof useStore>['health']): string {
  if (h.state === 'now') return 'Now';
  if (!h.forecast) return h.state === 'baseline' ? '—' : `${Math.max(0, Math.ceil(h.limits.maxDays - h.daysInUse))} days`;
  const s = Math.max(0, Math.round(h.forecast.sessionsRemaining));
  const days = Math.min(h.forecast.daysRemaining, h.limits.maxDays - h.daysInUse);
  const sessions = Math.min(s, h.limits.maxSessions - h.sessions);
  if (sessions <= 0 || days <= 0.5) return 'Next scan';
  return `~${sessions} session${sessions === 1 ? '' : 's'}`;
}

/** Biofouling / replacement summary. */
export default function StripHealthCard({ compact }: { compact?: boolean }) {
  const { health: h } = useStore();
  const key = STATE_COLOR_KEY[h.state];
  const clarity = h.clarity ?? 1;
  return (
    <Card onPress={() => router.push('/strip')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="strip" size={18} color={colors.textSecondary} />
          <T v="label">Sensing strip</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <StatusDot status={key} />
          <T v="small" style={{ color: colors.text }}>{STATE_WORD[h.state]}</T>
          <Icon name="chevron" size={14} color={colors.textMuted} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: space.lg }}>
        <View style={{ flex: 1.2 }}>
          <T v="small">Replace in</T>
          <T v="number" style={{ fontSize: 22, marginTop: 4 }} numberOfLines={1} adjustsFontSizeToFit>{replaceEta(h)}</T>
          {h.forecast && h.state !== 'now' ? (
            <T v="small" style={{ fontSize: 11 }}>
              est. {h.forecast.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </T>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <T v="small">Optical clarity</T>
          <T v="number" style={{ fontSize: 26, marginTop: 2 }}>{h.clarity != null ? pct(clarity) : '—'}</T>
          <T v="small" style={{ fontSize: 11 }}>limit {pct(h.limits.clarityReplace)}</T>
        </View>
        <View style={{ flex: 0.8 }}>
          <T v="small">In use</T>
          <T v="number" style={{ fontSize: 26, marginTop: 2 }}>{`${Math.floor(h.daysInUse) + 1}`}<T v="small">/{h.limits.maxDays}d</T></T>
          <T v="small" style={{ fontSize: 11 }}>{h.sessions} sessions</T>
        </View>
      </View>

      <View style={{ marginTop: space.lg }}>
        <Meter value={clarity} status={key} marks={[h.limits.clarityReplace]} />
      </View>
      {!compact ? <T v="small" style={{ marginTop: space.md }}>{h.detail}</T> : null}
    </Card>
  );
}
