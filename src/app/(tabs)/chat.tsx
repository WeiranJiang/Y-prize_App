import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import BottomSheet from '../../components/BottomSheet';
import { Button, IconButton, T } from '../../components/ui';
import { siteSeries } from '../../domain/analysis';
import { ask, AssistantContext, Reply, SiteTrend } from '../../domain/assistant';
import { buildInsights } from '../../domain/insights';
import { buildOverview } from '../../domain/overview';
import { CARE_DEMO_NOTICE, CARE_STARTERS, careDemoReply } from '../../domain/careMessaging';
import { RateLimiter } from '../../domain/rateLimit';
import type { Arch } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { colors, font, radius, space } from '../../theme/tokens';

interface Msg {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
}

const START: Msg = {
  id: 0, role: 'assistant',
  text: 'What would you like to discuss with your dental team? You can ask about your readings, retainer care, or preparing for a visit.',
};

export default function Chat() {
  const store = useStore();
  const { state } = store;
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([START]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [info, setInfo] = useState(false);
  const limiter = useRef(new RateLimiter()).current;
  const sending = useRef(false);
  const ids = useRef(1);
  const scroll = useRef<ScrollViewInstance>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= waitUntil) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [waitUntil]);
  const waiting = waitUntil > now;

  const ctx: AssistantContext = useMemo(() => {
    const cutoff = Date.now() - 14 * 86400000;
    const arches = (['upper', 'lower'] as Arch[]).map((a) => {
      const scan = store.latestScanFor(a);
      const strip = scan ? store.stripById(scan.stripId) : undefined;
      const ids = new Set(state.strips.filter((s) => s.arch === a).map((s) => s.id));
      const archScans = state.scans.filter((s) => ids.has(s.stripId));
      const health = store.healthFor(a);
      const built = scan && strip ? buildInsights(scan, strip, archScans, strip.id === health.strip.id ? health : null, state.settings.numbering) : null;
      // Two-week change per site, for answers like "pH has fallen from 6.3 to 5.4".
      const recent = archScans.filter((s) => +new Date(s.at) >= cutoff);
      const trends: Record<string, SiteTrend> = {};
      for (const site of strip?.sites ?? []) {
        const pts = siteSeries(site.id, recent, site.biomarker).filter((p) => p.value != null);
        if (pts.length >= 3) {
          trends[site.id] = { from: pts[0].value as number, to: pts[pts.length - 1].value as number, days: (+new Date(pts[pts.length - 1].at) - +new Date(pts[0].at)) / 86400000 };
        }
      }
      return { arch: a, analysis: built?.analysis, insights: built?.insights ?? [], recommendations: built?.recommendations ?? [], health, trends };
    });
    return {
      arches,
      overview: buildOverview(state.scans, state.strips, 30),
      numbering: state.settings.numbering,
      supply: state.supply,
      planMode: state.plan.mode,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.scans, state.strips, state.settings, state.supply, state.plan, state.rev]);

  const send = async () => {
    const question = text.trim().slice(0, 1000);
    if (!question || sending.current || waiting) return;
    const gate = limiter.take();
    if (!gate.ok) {
      setWaitUntil(Date.now() + gate.retryInMs);
      setNow(Date.now());
      return;
    }
    sending.current = true;
    const history = msgs.flatMap(message => message.role === 'system' ? [] : [{ role: message.role, text: message.text }]);
    setMsgs(messages => [...messages, { id: ids.current++, role: 'user', text: question }]);
    setText('');
    setBusy(true);
    try {
      const reply: Reply = careDemoReply(question) ?? await ask(question, history, ctx);
      setMsgs(messages => [...messages, { id: ids.current++, role: 'assistant', text: reply.text }]);
    } catch {
      setMsgs(messages => [...messages, { id: ids.current++, role: 'system', text: 'The demo reply couldn’t load. No message was sent to a clinic. Please try again.' }]);
      setText(question);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  const disabled = !text.trim() || busy || waiting;

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
              <T v="display" style={{ flex: 1, fontSize: 28 }}>Ask your dentist</T>
              <IconButton name="info" label="About dentist messaging demo" onPress={() => setInfo(true)} />
            </View>
            <View style={styles.recipient}>
              <View style={styles.avatar}><Icon name="profile" size={22} color={colors.text} /></View>
              <View style={{ flex: 1 }}><T v="bodyStrong">Your dental care team</T><T v="small">Demo practice</T></View>
              <View style={styles.demoTag}><T v="small" style={{ color: colors.text }}>Preview</T></View>
            </View>
            <T v="small" style={styles.notice}>{CARE_DEMO_NOTICE}</T>
          </View>

          <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            {msgs.map(message => message.role === 'system' ? <T key={message.id} v="small" accessibilityLiveRegion="polite" style={{ marginVertical: space.md }}>{message.text}</T> : (
              <View key={message.id} style={[styles.message, message.role === 'user' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                <T v="small" style={{ marginBottom: 5 }}>{message.role === 'user' ? 'You · demo message' : 'Dental team · automated demo reply'}</T>
                <View style={[styles.bubble, message.role === 'user' ? styles.patient : styles.team]}>
                  <T v="body" style={{ color: message.role === 'user' ? colors.textOnLight : colors.text }}>{message.text}</T>
                </View>
              </View>
            ))}
            {busy ? <T v="small" accessibilityLiveRegion="polite" style={{ paddingVertical: space.sm }}>Generating demo reply…</T> : null}
            {msgs.length === 1 ? <View style={styles.starters}>
              {CARE_STARTERS.map(starter => <Pressable key={starter.label} accessibilityRole="button" accessibilityLabel={`Draft message: ${starter.label}`} onPress={() => { setText(starter.text); input.current?.focus(); }} style={styles.chip}><T v="small" style={{ color: colors.text }}>{starter.label}</T></Pressable>)}
            </View> : null}
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, marginBottom: 76 + insets.bottom }}>
            {waiting ? <T v="small" accessibilityLiveRegion="polite" style={{ marginBottom: space.sm }}>Demo message limit. Try again in {Math.max(1, Math.ceil((waitUntil - now) / 1000))}s.</T> : null}
            <View style={styles.composer}>
              <TextInput
                ref={input} value={text} onChangeText={setText} maxLength={1000} multiline
                placeholder="Message your dental team…" placeholderTextColor={colors.textMuted}
                accessibilityLabel="Message your dental team" style={styles.input}
                editable={!busy && !waiting} textAlignVertical="top"
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Send demo message" accessibilityState={{ disabled }} disabled={disabled} onPress={send} style={[styles.send, disabled && { opacity: 0.35 }]}><Icon name="send" size={18} color={colors.textOnLight} /></Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <BottomSheet open={info} onClose={() => setInfo(false)}>
        <T v="title">Dentist messaging preview</T>
        <T v="body" style={{ marginTop: space.md }}>This screen demonstrates how messaging your healthcare provider could work. No practice is connected, and no clinician receives, reads or responds to these messages.</T>
        <T v="body" style={{ marginTop: space.md }}>Replies are generated automatically using demo readings. This conversation resets when the app is reloaded. Contact your actual dental practice for care or appointments.</T>
        <T v="body" style={{ marginTop: space.md }}>For urgent symptoms, contact a dentist or emergency service directly.</T>
        <Button label="Got it" style={{ marginTop: space.lg }} onPress={() => setInfo(false)} />
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  recipient: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, paddingVertical: space.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  demoTag: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface },
  notice: { color: colors.textSecondary, backgroundColor: colors.bg2, borderRadius: 8, padding: space.md, marginBottom: space.sm },
  message: { maxWidth: '92%', marginBottom: space.md },
  bubble: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  patient: { backgroundColor: colors.ivory, borderBottomRightRadius: 5 },
  team: { backgroundColor: colors.surface, borderBottomLeftRadius: 5 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.sm },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.border },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 10, color: colors.text, fontFamily: font.family, fontSize: 15, lineHeight: 21, outlineStyle: 'none' } as object,
  send: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
});
