/**
 * SPOT component kit. Flat graphite surfaces, hairline borders, no shadows,
 * 12–18px radii, 8-pt spacing, typography-led hierarchy.
 */
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
    <ScrollView style={styles.screen} contentContainerStyle={[{ paddingTop: insets.top + space.sm, paddingBottom: 112 }, contentStyle]} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  );
}

/** Large page title with an optional eyebrow line and trailing element. */
export function PageHeader({ eyebrow, title, right, style }: { eyebrow?: string; title: string; right?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, style]}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <T v="label">{eyebrow}</T> : null}
        <T v="display" style={{ marginTop: eyebrow ? 4 : 0 }}>{title}</T>
      </View>
      {right}
    </View>
  );
}

export function Section({ title, action, children, style }: { title?: string; action?: React.ReactNode; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: space.lg, marginTop: space.xl + space.sm }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? <T v="label">{title}</T> : <View />}
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
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.surfaceRaised }, style]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

export function StatusDot({ status, size = 7 }: { status: Status; size?: number }) {
  const c = STATUS_HEX[status];
  if (status === 'unavailable') return <View style={{ width: size, height: size, borderRadius: size, borderWidth: 1, borderColor: c }} />;
  return <View style={{ width: size, height: size, borderRadius: size, backgroundColor: c }} />;
}

/** Status is always shown as dot + words, never colour alone. */
export function StatusTag({ status, label }: { status: Status; label?: string }) {
  return (
    <View style={styles.tag}>
      <StatusDot status={status} />
      <T v="small" style={{ color: status === 'normal' || status === 'unavailable' ? colors.textSecondary : colors.text, marginLeft: 6, fontSize: 12 }}>
        {label ?? STATUS_LABEL[status]}
      </T>
    </View>
  );
}

/**
 * iOS-style segmented control. Scrolls horizontally if there are many
 * options; the selected segment is a raised graphite plate with white text.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  style,
  fill,
}: {
  options: { key: K; label: string; disabled?: boolean; badge?: string }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
  /** Stretch segments to the full width (no scrolling). */
  fill?: boolean;
}) {
  const inner = (
    <View style={[styles.seg, fill && { alignSelf: 'stretch' }]}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segItem, fill && { flex: 1 }, on && styles.segOn, o.disabled && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityState={{ selected: on, disabled: o.disabled }}
          >
            <Text style={[styles.segText, on && { color: colors.text }]} numberOfLines={1}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
  if (fill) return <View style={[{ paddingHorizontal: space.lg }, style]}>{inner}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[{ paddingHorizontal: space.lg }, style]}>
      {inner}
    </ScrollView>
  );
}

/** Text tabs with an underline — for long option lists (biomarkers). */
export function Tabs<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.xl }}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable key={o.key} onPress={() => onChange(o.key)} style={{ paddingTop: 10 }} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <Text style={[styles.tabText, on && { color: colors.text }]}>{o.label}</Text>
            <View style={{ height: 2, marginTop: 8, borderRadius: 1, backgroundColor: on ? colors.text : 'transparent' }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function Button({ label, onPress, kind = 'primary', icon, style, disabled, compact }: { label: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'ghost'; icon?: IconName; style?: StyleProp<ViewStyle>; disabled?: boolean; compact?: boolean }) {
  const primary = kind === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        compact && { height: 36, paddingHorizontal: 14, borderRadius: 10 },
        primary ? { backgroundColor: colors.text } : kind === 'secondary' ? { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={compact ? 15 : 18} color={primary ? colors.textOnLight : colors.text} /> : null}
      <Text style={[styles.btnText, compact && { fontSize: 14 }, { color: primary ? colors.textOnLight : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ label, value, sub, onPress, right }: { label: string; value?: string; sub?: string; onPress?: () => void; right?: React.ReactNode }) {
  const inner = (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: space.md }}>
        <T v="bodyStrong" style={{ fontSize: 15 }}>{label}</T>
        {sub ? <T v="small" style={{ marginTop: 2 }}>{sub}</T> : null}
      </View>
      {value ? <T v="body" style={{ color: colors.textSecondary, fontVariant: ['tabular-nums'] }}>{value}</T> : null}
      {right}
      {onPress ? <Icon name="chevron" size={15} color={colors.textMuted} /> : null}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function Meter({ value, status, height = 3, marks }: { value: number; status: Status; height?: number; marks?: number[] }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.surfaceRaised }}>
      <View style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, height, borderRadius: height, backgroundColor: status === 'unavailable' || status === 'normal' ? '#8A8A8A' : STATUS_HEX[status] }} />
      {marks?.map((m) => (
        <View key={m} style={{ position: 'absolute', left: `${m * 100}%`, top: -3, width: 1, height: height + 6, backgroundColor: colors.textSecondary }} />
      ))}
    </View>
  );
}

export function DemoBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.demo, style]}>
      <T v="label" style={{ fontSize: 9.5, letterSpacing: 0.5 }}>Demo data</T>
    </View>
  );
}

/** Status key: in range / borderline / needs attention / not measured. */
export function Legend({ items, showUnmeasured = true }: { title?: string; items?: { status: Status; label: string }[]; showUnmeasured?: boolean }) {
  const list = items ?? [
    { status: 'normal' as Status, label: 'In range' },
    { status: 'mild' as Status, label: 'Borderline' },
    { status: 'high' as Status, label: 'Needs attention' },
  ];
  return (
    <View style={styles.legend}>
      {list.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StatusDot status={i.status} size={6} />
          <T v="small" style={{ marginLeft: 6, fontSize: 11.5 }}>{i.label}</T>
        </View>
      ))}
      {showUnmeasured ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <StatusDot status="unavailable" size={6} />
          <T v="small" style={{ marginLeft: 6, fontSize: 11.5 }}>Not measured</T>
        </View>
      ) : null}
    </View>
  );
}

export function IconButton({ name, onPress, style, label }: { name: IconName; onPress: () => void; style?: StyleProp<ViewStyle>; label?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: colors.surfaceRaised }, style]}>
      <Icon name={name} size={18} color={colors.text} />
    </Pressable>
  );
}

export function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <T v="small">{k}</T>
      <T v="small" style={{ color: colors.text, fontFamily: font.family, fontWeight: mono ? '500' : '400', fontVariant: ['tabular-nums'], maxWidth: '60%', textAlign: 'right' }}>{v}</T>
    </View>
  );
}

/** Small metadata line, e.g. "8:42 AM · Quality 96%". */
export function Meta({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <T v="small" style={[{ fontSize: 12, color: colors.textMuted }, style]}>{children}</T>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm + 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
  },
  tag: { flexDirection: 'row', alignItems: 'center' },
  seg: { flexDirection: 'row', padding: 2, borderRadius: 10, backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignSelf: 'flex-start' },
  segItem: { minWidth: 52, paddingHorizontal: 12, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.surfaceRaised },
  segText: { fontFamily: font.family, fontWeight: '500', fontSize: 13, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  tabText: { fontFamily: font.family, fontWeight: '500', fontSize: 15, color: colors.textMuted },
  btn: { height: 48, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  btnText: { fontFamily: font.family, fontWeight: '600', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 8 },
  demo: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignSelf: 'flex-start' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: space.lg },
  iconBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
});
