import React, { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { T } from '../../components/ui';
import { ask, AssistantContext, Reply } from '../../domain/assistant';
import { buildInsights } from '../../domain/insights';
import { buildOverview } from '../../domain/overview';
import type { Arch } from '../../domain/teeth';
import { useStore } from '../../state/store';
import { colors, font, radius, space } from '../../theme/tokens';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  suggestions?: string[];
}

const START: Msg = {
  id: 0,
  role: 'assistant',
  text: 'Hi, I can answer questions about your teeth, any biomarker, or your strips, using your latest scans.',
  suggestions: ['How are my teeth overall?', 'Which teeth need attention?', 'What should I do this week?', 'When should I replace my strips?'],
};

export default function Chat() {
  const store = useStore();
  const { state } = store;
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([START]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const ctx: AssistantContext = useMemo(() => {
    const arches = (['upper', 'lower'] as Arch[]).map((a) => {
      const scan = store.latestScanFor(a);
      const strip = scan ? store.stripById(scan.stripId) : undefined;
      const ids = new Set(state.strips.filter((s) => s.arch === a).map((s) => s.id));
      const archScans = state.scans.filter((s) => ids.has(s.stripId));
      const health = store.healthFor(a);
      const built = scan && strip ? buildInsights(scan, strip, archScans, strip.id === health.strip.id ? health : null, state.settings.numbering) : null;
      return { arch: a, analysis: built?.analysis, insights: built?.insights ?? [], recommendations: built?.recommendations ?? [], health };
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
    const question = q.trim();
    if (!question || busy) return;
    setText('');
    const userMsg: Msg = { id: Date.now(), role: 'user', text: question };
    setMsgs((m) => [...m, userMsg]);
    setBusy(true);
    const history = msgs.map((m) => ({ role: m.role, text: m.text }));
    const reply: Reply = await ask(question, history, ctx);
    setMsgs((m) => [...m, { id: Date.now() + 1, role: 'assistant', text: reply.text, suggestions: reply.suggestions }]);
    setBusy(false);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const last = msgs[msgs.length - 1];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
        <T v="display">Ask</T>
        <T v="small" style={{ marginTop: 2 }}>Answers come from your own readings. Not medical advice.</T>
      </View>

      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space.xl, paddingBottom: 24 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === 'user' ? styles.user : styles.bot]}>
            <T v="body" style={{ color: m.role === 'user' ? colors.textOnLight : colors.text, fontSize: 14.5, lineHeight: 21 }}>{m.text}</T>
          </View>
        ))}
        {busy ? (
          <View style={[styles.bubble, styles.bot]}>
            <T v="small">…</T>
          </View>
        ) : null}
        {!busy && last.role === 'assistant' && last.suggestions?.length ? (
          <View style={styles.suggest}>
            {last.suggestions.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={styles.chip}>
                <T v="small" style={{ color: colors.text }}>{s}</T>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.inputBar, { marginBottom: 76 + insets.bottom }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask about your teeth…"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
        />
        <Pressable onPress={() => send(text)} style={[styles.send, !text.trim() && { opacity: 0.4 }]} disabled={!text.trim()} accessibilityLabel="Send">
          <Icon name="send" size={18} color={colors.textOnLight} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.ivory, borderBottomRightRadius: 6 },
  bot: { alignSelf: 'flex-start', backgroundColor: colors.bg2, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, borderBottomLeftRadius: 6 },
  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.xl, paddingLeft: 16, paddingRight: 6, height: 50, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, backgroundColor: colors.bg2 },
  input: { flex: 1, color: colors.text, fontFamily: font.family, fontWeight: '400', fontSize: 15, outlineStyle: 'none' } as object,
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ivory, alignItems: 'center', justifyContent: 'center' },
});
