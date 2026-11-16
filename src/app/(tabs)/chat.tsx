import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Meta, T } from '../../components/ui';
import { siteSeries } from '../../domain/analysis';
import { ask, AssistantContext, Reply, SiteTrend, Topic } from '../../domain/assistant';
import { buildInsights } from '../../domain/insights';
import { buildOverview } from '../../domain/overview';
import { RateLimiter } from '../../domain/rateLimit';
import type { Arch } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { colors, font, radius, space } from '../../theme/tokens';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  suggestions?: string[];
  topic?: Topic;
}

const START: Msg = {
  id: 0,
  role: 'assistant',
  text: 'Hi! Ask me about your readings, what a number means, or everyday things like flossing, drinks and retainer care. These are simulated demo readings.',
  suggestions: ['How are my teeth overall?', 'Which teeth need attention?', 'What should I do this week?', 'Is coffee bad for my teeth?'],
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
  const limiter = useRef(new RateLimiter()).current;
  const sending = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);

  // Countdown while rate-limited.
  useEffect(() => {
    if (waitUntil <= Date.now()) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= waitUntil) clearInterval(id);
    }, 250);
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

  const send = async (q: string) => {
    const question = q.trim().slice(0, 500);
    if (!question || sending.current) return;
    const gate = limiter.take();
    if (!gate.ok) {
      const secs = Math.ceil(gate.retryInMs / 1000);
      setWaitUntil(Date.now() + gate.retryInMs);
      setNow(Date.now());
      setMsgs((m) => [
        ...m,
        { id: Date.now(), role: 'assistant', text: secs <= 2 ? 'One sec, still thinking about your last question.' : `You’re asking faster than I can keep up (limit: ${gate.label}). Give me about ${secs < 60 ? `${secs} seconds` : `${Math.ceil(secs / 60)} minutes`} and ask again.` },
      ]);
      return;
    }
    sending.current = true;
    setText('');
    setMsgs((m) => [...m, { id: Date.now(), role: 'user', text: question }]);
    setBusy(true);
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    const topic = [...msgs].reverse().find((m) => m.topic)?.topic;
    const started = Date.now();
    try {
    const reply: Reply = await ask(question, history, ctx, topic);
    // A short, natural pause so on-device answers don't feel robotic.
    const pause = Math.max(0, Math.min(900, 350 + reply.text.length * 1.2) - (Date.now() - started));
    await new Promise((r) => setTimeout(r, pause));
    setMsgs((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: reply.text, suggestions: reply.suggestions, topic: reply.topic ?? topic }]);
    } catch {
      setMsgs(m => [...m, { id: Date.now() + 1, role: 'assistant', text: 'I couldn’t finish that answer. Please try again.' }]);
    } finally {
      sending.current = false;
      setBusy(false);
    }
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const last = msgs[msgs.length - 1];
  const disabled = !text.trim() || busy || waiting;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: space.sm, backgroundColor: colors.bg, zIndex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <T v="display">Ask</T>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1, overflow: 'hidden' }} contentContainerStyle={{ padding: space.lg, paddingBottom: 24 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.user : styles.bot]}>
            <T v="body" style={{ color: m.role === 'user' ? colors.textOnLight : colors.text, fontSize: 15, lineHeight: 22 }}>{m.text}</T>
          </View>
        ))}
        {busy ? (
          <View style={[styles.bubble, styles.bot, { paddingVertical: 12 }]}>
            <T v="small" style={{ letterSpacing: 2 }}>•••</T>
          </View>
        ) : null}
        {!busy && last.role === 'assistant' && last.suggestions?.length ? (
          <View style={styles.suggest}>
            {last.suggestions.map((s) => (
              <Pressable key={s} onPress={() => send(s)} disabled={waiting} style={({ pressed }) => [styles.chip, (pressed || waiting) && { opacity: 0.6 }]}>
                <T v="small" style={{ color: colors.text }}>{s}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ marginBottom: 76 + insets.bottom }}>
        {waiting ? <Meta style={{ textAlign: 'center', marginBottom: 6 }}>You can ask again in {Math.ceil((waitUntil - now) / 1000)}s</Meta> : null}
        <View style={styles.inputBar}>
          <TextInput
            value={text}
            onChangeText={setText}
            maxLength={500}
            placeholder={waiting ? 'Taking a short breather…' : 'Ask anything about your teeth…'}
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            onSubmitEditing={() => !disabled && send(text)}
            returnKeyType="send"
            editable={!waiting}
          />
          <Pressable onPress={() => send(text)} style={[styles.send, disabled && { opacity: 0.35 }]} disabled={disabled} accessibilityLabel="Send">
            <Icon name="send" size={18} color={colors.textOnLight} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.ivory, borderBottomRightRadius: 6 },
  bot: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderBottomLeftRadius: 6 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.lg, paddingLeft: 14, paddingRight: 5, height: 48, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.text, fontFamily: font.family, fontWeight: '400', fontSize: 15, outlineStyle: 'none' } as object,
  send: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
});
