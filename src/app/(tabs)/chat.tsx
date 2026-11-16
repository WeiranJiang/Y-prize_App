import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import BottomSheet from '../../components/BottomSheet';
import { Button, IconButton, Segmented, T } from '../../components/ui';
import { siteSeries } from '../../domain/analysis';
import { ask, AssistantContext, Reply, SiteTrend } from '../../domain/assistant';
import { buildInsights } from '../../domain/insights';
import { buildOverview } from '../../domain/overview';
import { CARE_STARTERS, careDemoReply } from '../../domain/careMessaging';
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
  text: 'I can help explain your readings and retainer care while you wait to speak with your dentist.',
};

export default function Chat() {
  const store = useStore();
  const { state } = store;
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'dentist' | 'bot'>('dentist');
  const [drafts, setDrafts] = useState<Msg[]>([]);
  const [dentistText, setDentistText] = useState('');
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
    const question = (mode === 'dentist' ? dentistText : text).trim().slice(0, 1000);
    if (!question || sending.current || waiting) return;
    const gate = limiter.take();
    if (!gate.ok) {
      setWaitUntil(Date.now() + gate.retryInMs);
      setNow(Date.now());
      return;
    }
    if (mode === 'dentist') {
      setDrafts(messages => [...messages, { id: ids.current++, role: 'user', text: question }]);
      setDentistText('');
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
  const disabled = !(mode === 'dentist' ? dentistText : text).trim() || busy || waiting;

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center' }}>
          <View style={{ paddingTop: insets.top + space.md, paddingHorizontal: space.lg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
              <T v="display" style={{ flex: 1, fontSize: 28 }}>Messages</T>
              <IconButton name="info" label="About dentist messaging demo" onPress={() => setInfo(true)} />
            </View>
            <Segmented fill style={{ marginTop: space.md }} options={[{ key: 'dentist', label: 'My dentist' }, { key: 'bot', label: 'Ask chatbot' }]} value={mode} onChange={setMode} />
            <View style={styles.recipient}>
              <View style={styles.avatar}><Icon name="profile" size={22} color={colors.text} /></View>
              <View style={{ flex: 1 }}><T v="bodyStrong">{mode === 'dentist' ? 'Melissa Pike' : 'OraCare chatbot'}</T><T v="small">{mode === 'dentist' ? 'Your dentist' : 'Automated answers'}</T></View>

            </View>
            <T v="small" style={styles.notice}>{mode === 'dentist' ? 'Ask about your readings, retainer care or a concern. Messaging isn’t connected yet; drafts stay here until you reload.' : 'Get a faster answer from the chatbot. Automated guidance, not a reply from Melissa.'}</T>
          </View>

          <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled" onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
            {mode === 'dentist' && !drafts.length ? <T v="body">Write a message for Melissa, or ask the chatbot for a quick answer.</T> : null}
            {(mode === 'dentist' ? drafts : msgs).map(message => message.role === 'system' ? <T key={message.id} v="small" accessibilityLiveRegion="polite" style={{ marginVertical: space.md }}>{message.text}</T> : (
              <View key={message.id} style={[styles.message, message.role === 'user' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }]}>
                <T v="small" style={{ marginBottom: 5 }}>{message.role === 'user' ? (mode === 'dentist' ? 'You · draft, not sent' : 'You') : 'OraCare chatbot'}</T>
                <View style={[styles.bubble, message.role === 'user' ? styles.patient : styles.team]}>
                  <T v="body" style={{ color: message.role === 'user' ? colors.textOnLight : colors.text }}>{message.text}</T>
                </View>
              </View>
            ))}
            {busy ? <T v="small" accessibilityLiveRegion="polite" style={{ paddingVertical: space.sm }}>Preparing an answer…</T> : null}
            {(mode === 'dentist' ? drafts.length === 0 : msgs.length === 1) ? <View style={styles.starters}>
              {CARE_STARTERS.map(starter => <Pressable key={starter.label} accessibilityRole="button" accessibilityLabel={`Draft message: ${starter.label}`} onPress={() => { if (mode === 'dentist') setDentistText(starter.text); else setText(starter.text); input.current?.focus(); }} style={styles.chip}><T v="small" style={{ color: colors.text }}>{starter.label}</T></Pressable>)}
            </View> : null}
          </ScrollView>

          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm, marginBottom: 76 + insets.bottom }}>
            {waiting ? <T v="small" accessibilityLiveRegion="polite" style={{ marginBottom: space.sm }}>Message limit. Try again in {Math.max(1, Math.ceil((waitUntil - now) / 1000))}s.</T> : null}
            <View style={styles.composer}>
              <TextInput
                ref={input} value={mode === 'dentist' ? dentistText : text} onChangeText={mode === 'dentist' ? setDentistText : setText} maxLength={1000} multiline
                placeholder={mode === 'dentist' ? 'Message Melissa…' : 'Ask the chatbot…'} placeholderTextColor={colors.textMuted}
                accessibilityLabel={mode === 'dentist' ? 'Message Melissa' : 'Ask the chatbot'} style={styles.input}
                editable={!busy && !waiting} textAlignVertical="top"
              />
              <Pressable accessibilityRole="button" accessibilityLabel={mode === 'dentist' ? 'Save message draft' : 'Send to chatbot'} accessibilityState={{ disabled }} disabled={disabled} onPress={send} style={[styles.send, disabled && { opacity: 0.35 }]}>{mode === 'dentist' ? <T v="small" style={{ color: colors.textOnLight }}>Save</T> : <Icon name="send" size={18} color={colors.textOnLight} />}</Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      <BottomSheet open={info} onClose={() => setInfo(false)}>
        <T v="title">About messages</T>
        <T v="body" style={{ marginTop: space.md }}>Melissa Pike is the dentist contact shown in this preview. Dentist messaging is not connected yet. Saving a draft does not deliver it to Melissa.</T>
        <T v="body" style={{ marginTop: space.md }}>The separate OraCare chatbot offers faster automated answers about readings and retainer care. It never replies as Melissa. Drafts and chatbot conversations reset on reload.</T>
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
