import React from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STATUS_LABEL, Status } from '../domain/biomarkers';
import { STATUS_HEX } from '../three/regions';
import { colors, font, radius, space, type } from '../theme/tokens';
import Icon, { IconName } from './Icon';

type V = keyof typeof type;
export function T({ v = 'body', style, ...rest }: TextProps & { v?: V; style?: StyleProp<TextStyle> }) {
  return <Text {...rest} style={[type[v] as TextStyle, style]} />;
}

export function Screen({ children, scroll = true, contentStyle }: { children: React.ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  if (!scroll) return <View style={[styles.screen, { paddingTop: insets.top }]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[{ paddingTop: insets.top + space.md, paddingBottom: 120 }, contentStyle]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: space.xl, marginTop: space.xxl }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? <T v="heading">{title}</T> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.75 }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairlineStrong }, style]} />;
}

export function StatusDot({ status, size = 8 }: { status: Status; size?: number }) {
  const c = STATUS_HEX[status];
  if (status === 'unavailable')
    return <View style={{ width: size, height: size, borderRadius: size, borderWidth: 1, borderColor: c, borderStyle: 'dashed' }} />;
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: c }} />;
}

/** Status is always shown as dot + words, never colour alone. */
export function StatusTag({ status, label }: { status: Status; label?: string }) {
  return (
    <View style={styles.tag}>
      <StatusDot status={status} />
      <T v="small" style={{ color: colors.text, marginLeft: 6 }}>{label ?? STATUS_LABEL[status]}</T>
    </View>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { key: K; label: string; disabled?: boolean; badge?: string }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ gap: 6, paddingHorizontal: space.xl }, style]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.pill, on && styles.pillOn, o.disabled && { opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: o.disabled }}
          >
            <Text style={[styles.pillText, on && { color: colors.textOnLight }]}>{o.label}</Text>
            {o.badge ? <Text style={[styles.badge, on && { color: colors.textOnLight }]}>{o.badge}</Text> : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, style, disabled }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost'; icon?: IconName; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary ? { backgroundColor: colors.ivory } : kind === 'secondary' ? { borderWidth: 1, borderColor: colors.hairlineStrong } : null,
        (pressed || disabled) && { opacity: 0.6 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={primary ? colors.textOnLight : colors.text} /> : null}
      <Text style={[styles.btnText, { color: primary ? colors.textOnLight : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ label, value, sub, onPress, right }: { label: string; value?: string; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  const inner = (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <T v="bodyStrong" style={{ fontSize: 14 }}>{label}</T>
        {sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      {value ? <T v="body" style={{ color: colors.text, fontVariant: ['tabular-nums'] }}>{value}</T> : null}
      {right}
      {onPress ? <Icon name="chevron" size={16} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function Meter({ value, status, height = 4, marks }: { value: number; status: Status; height?: number; marks?: number[] }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: 'rgba(155,165,184,0.16)', overflow: 'visible' }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height, backgroundColor: STATUS_HEX[status] }} />
      {marks?.map((m) => (
        <View key={m} style={{ position: 'absolute', left: `${m * 100}%`, top: -3, width: 1, height: height + 6, backgroundColor: colors.textSecondary }} />
      ))}
    </View>
  );
}

export function DemoBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.demo, style]}>
      <T v="label" style={{ fontSize: 9, letterSpacing: 1, color: colors.accent }}>Demo data</T>
    </View>
  );
}

export function Legend({ title, items, showUnmeasured = true }: { title?: string; items?: { status: Status; label: string }[]; showUnmeasured?: boolean }) {
  const list = items ?? [
    { status: 'normal' as Status, label: 'Normal' },
    { status: 'mild' as Status, label: 'Mild' },
    { status: 'elevated' as Status, label: 'Elevated' },
    { status: 'high' as Status, label: 'High' },
  ];
  return (
    <View style={styles.legend}>
      {title ? <T v="label" style={{ fontSize: 9, marginBottom: 6 }}>{title}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 }}>
        {list.map((i, idx) => (
          <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {idx > 0 ? <T v="small" style={{ color: colors.textMuted, marginRight: 8, fontSize: 10 }}>→</T> : null}
            <StatusDot status={i.status} size={7} />
            <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>{i.label}</T>
          </View>
        ))}
        {showUnmeasured ? (
          <>
            <View style={{ width: 1, height: 12, backgroundColor: colors.hairlineStrong, marginHorizontal: 2 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <StatusDot status="unavailable" size={7} />
              <T v="small" style={{ marginLeft: 5, fontSize: 11 }}>Unmeasured</T>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

export function IconButton({ name, onPress, style }: { name: IconName; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }, style]}>
      <Icon name={name} size={18} />
    </Pressable>
  );
}

export function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 }}>
      <T v="small">{k}</T>
      <T v="small" style={{ color: colors.text, fontFamily: mono ? font.medium : font.regular, fontVariant: ['tabular-nums'], maxWidth: '60%', textAlign: 'right' }}>{v}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  card: {
    backgroundColor: colors.bg2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    padding: space.lg,
  },
  tag: { flexDirection: 'row', alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 32,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  pillOn: { backgroundColor: colors.ivory, borderColor: colors.ivory },
  pillText: { fontFamily: font.medium, fontSize: 13, color: colors.text },
  badge: { fontFamily: font.medium, fontSize: 9, letterSpacing: 0.8, color: colors.textMuted, marginLeft: 6, textTransform: 'uppercase' },
  btn: { height: 50, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 22 },
  btnText: { fontFamily: font.medium, fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 8 },
  demo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(169,184,255,0.4)', alignSelf: 'flex-start' },
  legend: { alignItems: 'center' },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
});
