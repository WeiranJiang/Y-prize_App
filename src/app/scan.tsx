import { router, useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import CaseIllustration from '../components/CaseIllustration';
import Icon from '../components/Icon';
import { replaceEta } from '../components/StripHealthCard';
import ArchToggle from '../components/ArchToggle';
import BiomarkerLegend from '../components/BiomarkerLegend';
import { Button, Card, DemoBadge, Divider, Screen, StatusDot, T } from '../components/ui';
import { pct } from '../domain/fouling';
import { useStore } from '../state/store';
import RetainerView from '../three/RetainerView';
import { regionsForScan } from '../three/regions';
import { colors, space } from '../theme/tokens';

type Step = 'prepare' | 'wear' | 'place' | 'scanning' | 'results';

const STAGES = [
  { key: 'detect', label: 'Retainer detected', ms: 900 },
  { key: 'align', label: 'Aligning sensor map', ms: 1300 },
  { key: 'clarity', label: 'Checking strip clarity', ms: 1300 },
  { key: 'read', label: 'Reading optical signals', ms: 3600 },
  { key: 'validate', label: 'Validating measurements', ms: 1400 },
  { key: 'sync', label: 'Syncing with phone', ms: 1100 },
] as const;

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const haptic = () => {
  if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
};

export default function Scan() {
  const store = useStore();
  const { state, health, dispatch, runDemoScan } = store;
  const focused = useIsFocused();
  const [step, setStep] = useState<Step>('prepare');
  const [checks, setChecks] = useState([false, false]);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [removedAt, setRemovedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [stage, setStage] = useState(-1);
  const [newScanId, setNewScanId] = useState<string | null>(null);
  const scanAnim = useRef({ beam: 0, colorReveal: 0 }).current;
  const planned = state.settings.protocol.sessionMinutes * 60;
  const windowMin = state.settings.protocol.readoutWindowMin;
  const withinUse = health.state !== 'now';

  // Wear timer
  useEffect(() => {
    if (step !== 'wear' || paused) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [step, paused]);

  // Readout-window countdown
  useEffect(() => {
    if (step !== 'place') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  // Optical scanning stages (simulated in demo mode; real hardware would drive `stage` from case events).
  useEffect(() => {
    if (step !== 'scanning') return;
    let cancelled = false;
    let i = 0;
    scanAnim.beam = 0;
    scanAnim.colorReveal = 0;
    dispatch({ type: 'case', status: 'scanning' });
    const run = () => {
      if (cancelled) return;
      if (i >= STAGES.length) {
        dispatch({ type: 'case', status: 'connected' });
        setStage(STAGES.length);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setTimeout(() => !cancelled && setStep('results'), 700);
        return;
      }
      setStage(i);
      const s = STAGES[i];
      if (s.key === 'clarity') {
        const scan = runDemoScan();
        setNewScanId(scan.id);
      }
      if (s.key === 'sync') dispatch({ type: 'case', status: 'syncing' });
      const t0 = Date.now();
      const tick = () => {
        if (cancelled) return;
        const k = Math.min(1, (Date.now() - t0) / s.ms);
        if (s.key === 'read') scanAnim.beam = k;
        if (s.key === 'validate' || s.key === 'sync') scanAnim.colorReveal = Math.min(1, scanAnim.colorReveal + 0.03);
        if (k < 1) requestAnimationFrame(tick);
        else {
          i++;
          run();
        }
      };
      tick();
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const latest = store.latestScan;
  const scanStrip = latest ? store.stripById(latest.stripId) : undefined;
  const regions = useMemo(() => regionsForScan(latest, scanStrip, 'overview'), [latest, scanStrip]);
  const a = store.analysis;

  const restart = () => {
    setStep('prepare');
    setElapsed(0);
    setPaused(false);
    setStage(-1);
    setRemovedAt(null);
    setNewScanId(null);
    setChecks([false, false]);
  };

  const windowLeft = removedAt ? windowMin * 60 - (now - removedAt) / 1000 : windowMin * 60;

  return (
    <Screen>
      <View style={styles.header}>
        <T v="label">{['Prepare', 'Wear', 'Place', 'Read', 'Results'][['prepare', 'wear', 'place', 'scanning', 'results'].indexOf(step)]} · Step {['prepare', 'wear', 'place', 'scanning', 'results'].indexOf(step) + 1} of 5</T>
        <DemoBadge />
      </View>
      <View style={styles.progress}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.progSeg, i <= ['prepare', 'wear', 'place', 'scanning', 'results'].indexOf(step) && { backgroundColor: colors.text }]} />
        ))}
      </View>

      {step === 'prepare' && (
        <View style={styles.body}>
          <View style={{ alignItems: 'center', marginTop: space.lg }}>
            <CaseIllustration stage="open" />
          </View>
          <T v="display" style={{ marginTop: space.xl }}>Ready for your scan?</T>
          <T v="body" style={{ marginTop: space.sm }}>Place your sensing strip inside your retainer before wearing it.</T>

          <Card style={{ marginTop: space.xl }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ fontSize: 10 }}>Protocol</T>
                <T v="bodyStrong" style={{ marginTop: 4 }}>{state.settings.protocol.label}</T>
                <T v="small">Not a validated clinical duration. Follow your dentist's guidance if you have it.</T>
              </View>
            </View>
            <Divider style={{ marginVertical: space.md }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="body" style={{ color: colors.text }}>Wear timer</T>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Stepper label="−" onPress={() => dispatch({ type: 'settings', patch: { protocol: { ...state.settings.protocol, sessionMinutes: Math.max(1, state.settings.protocol.sessionMinutes - 1) } } })} />
                <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'], minWidth: 54, textAlign: 'center' }}>{state.settings.protocol.sessionMinutes} min</T>
                <Stepper label="+" onPress={() => dispatch({ type: 'settings', patch: { protocol: { ...state.settings.protocol, sessionMinutes: Math.min(60, state.settings.protocol.sessionMinutes + 1) } } })} />
              </View>
            </View>
            <T v="small" style={{ marginTop: space.sm }}>Readout window after removal: {windowMin} min</T>
          </Card>

          <View style={{ marginTop: space.xl }}>
            {['Sensing strips attached (upper and lower)', 'Retainers seated correctly'].map((label, i) => (
              <Pressable key={label} onPress={() => { haptic(); setChecks((c) => c.map((v, j) => (j === i ? !v : v))); }} style={styles.check}>
                <View style={[styles.box, checks[i] && { backgroundColor: colors.ivory, borderColor: colors.ivory }]}>
                  {checks[i] ? <Icon name="check" size={14} color={colors.textOnLight} strokeWidth={2} /> : null}
                </View>
                <T v="bodyStrong" style={{ fontSize: 15 }}>{label}</T>
              </Pressable>
            ))}
            <Pressable onPress={() => router.push('/strip')} style={styles.check}>
              <View style={[styles.box, withinUse && { backgroundColor: colors.ivory, borderColor: colors.ivory }]}>
                {withinUse ? <Icon name="check" size={14} color={colors.textOnLight} strokeWidth={2} /> : <Icon name="close" size={12} color={colors.high} strokeWidth={2} />}
              </View>
              <View style={{ flex: 1 }}>
                <T v="bodyStrong" style={{ fontSize: 15 }}>{store.arch === 'upper' ? 'Upper' : 'Lower'} strip within its validated use period</T>
                <T v="small">
                  Day {Math.floor(health.daysInUse) + 1} of {health.limits.maxDays} · clarity {health.clarity != null ? pct(health.clarity) : '—'} · replace in {replaceEta(health).toLowerCase()}
                </T>
              </View>
              <Icon name="chevron" size={14} color={colors.textMuted} />
            </Pressable>
          </View>
          {!withinUse ? (
            <Card style={{ marginTop: space.md, borderColor: 'rgba(239,104,115,0.4)' }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <StatusDot status="high" />
                <T v="bodyStrong">{health.headline}</T>
              </View>
              <T v="small" style={{ marginTop: 6 }}>{health.detail} You can still scan, but low-signal sites will be withheld.</T>
            </Card>
          ) : null}

          <Button label="Start session" style={{ marginTop: space.xl }} disabled={!checks.every(Boolean)} onPress={() => { haptic(); setStep('wear'); }} />
        </View>
      )}

      {step === 'wear' && (
        <View style={[styles.body, { alignItems: 'center' }]}>
          <TimerRing progress={Math.min(1, elapsed / planned)} size={250}>
            <T v="label">{paused ? 'Paused' : 'Session in progress'}</T>
            <T v="number" style={{ fontSize: 52, marginTop: 6 }}>{fmt(elapsed)}</T>
            <T v="small">elapsed of {fmt(planned)} planned</T>
          </TimerRing>
          <T v="body" style={{ marginTop: space.xxl, textAlign: 'center', paddingHorizontal: space.md }}>
            Your strip is sampling the fluid around each sensing site. The case reads the strip's state when you place it inside. It does not record a history of this session.
          </T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: space.xl, alignSelf: 'stretch' }}>
            <Button label={paused ? 'Resume' : 'Pause'} kind="secondary" style={{ flex: 1 }} onPress={() => setPaused((p) => !p)} />
            <Button label="Cancel session" kind="secondary" style={{ flex: 1 }} onPress={restart} />
          </View>
          <Button
            label={elapsed >= planned ? "I've removed my retainer" : 'Remove retainer now'}
            style={{ marginTop: space.md, alignSelf: 'stretch' }}
            onPress={() => { haptic(); setRemovedAt(Date.now()); setStep('place'); }}
          />
          {elapsed < planned ? (
            <Pressable onPress={() => setElapsed(planned)} style={{ marginTop: space.lg }}>
              <T v="small" style={{ color: colors.accent }}>Demo: skip to end of timer</T>
            </Pressable>
          ) : null}
        </View>
      )}

      {step === 'place' && (
        <View style={styles.body}>
          <View style={{ alignItems: 'center', marginTop: space.md }}>
            <CaseIllustration stage="placing" />
          </View>
          <T v="display" style={{ marginTop: space.lg }}>Ready to read your strip</T>
          <View style={{ marginTop: space.lg }}>
            {['Remove the retainer.', 'Place it into the contoured scanning tray.', 'Align the retainer with the positioning guides.', 'Close the lid.'].map((s, i) => (
              <View key={s} style={{ flexDirection: 'row', gap: 14, paddingVertical: 9 }}>
                <T v="label" style={{ color: colors.textMuted, marginTop: 3 }}>{i + 1}</T>
                <T v="body" style={{ color: colors.text, flex: 1 }}>{s}</T>
              </View>
            ))}
          </View>
          <Card style={{ marginTop: space.md, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="clock" size={20} color={windowLeft > 60 ? colors.textSecondary : colors.mild} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" style={{ fontSize: 14 }}>Read within {windowMin} min of removal</T>
              <T v="small">
                {windowLeft > 0 ? `${fmt(windowLeft)} remaining. ` : 'Window passed: results will be marked lower confidence. '}
                Do not rinse or wipe the strip. That can change the chemistry it reads.
              </T>
            </View>
          </Card>
          <Button label="Lid closed — start reading" style={{ marginTop: space.xl }} onPress={() => { haptic(); setStep('scanning'); }} />
          <T v="small" style={{ textAlign: 'center', marginTop: space.md, color: colors.textMuted }}>With a connected case, reading starts automatically when the lid closes.</T>
        </View>
      )}

      {step === 'scanning' && (
        <View style={styles.body}>
          <View style={{ height: 300, marginHorizontal: -space.xl }}>
            <RetainerView key={store.arch} arch={store.arch} style={{ flex: 1 }} regions={regions} scan={scanAnim} interactive={false} autoRotate={false} active={focused} zoom={0.92} />
          </View>
          <T v="title" style={{ textAlign: 'center' }}>{stage >= 0 && stage < STAGES.length ? STAGES[stage].label : stage >= STAGES.length ? 'Scan complete' : 'Starting'}</T>
          <View style={{ height: 2, backgroundColor: colors.hairline, borderRadius: 1, marginTop: space.lg, overflow: 'hidden' }}>
            <View style={{ height: 2, width: `${(Math.max(0, stage) / STAGES.length) * 100}%`, backgroundColor: colors.text }} />
          </View>
          <View style={{ marginTop: space.lg }}>
            {STAGES.map((s, i) => (
              <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, opacity: i <= stage ? 1 : 0.35 }}>
                <View style={[styles.stageDot, i < stage && { backgroundColor: colors.text, borderColor: colors.text }, i === stage && { borderColor: colors.accent }]}>
                  {i < stage ? <Icon name="check" size={10} color={colors.bg} strokeWidth={2.4} /> : null}
                </View>
                <T v="body" style={{ color: i <= stage ? colors.text : colors.textSecondary }}>{s.label}</T>
                {s.key === 'clarity' && i < stage && latest && newScanId === latest.id ? (
                  <T v="small" style={{ marginLeft: 'auto' }}>{pct(latest.references.reduce((x, r) => x + r.transmission, 0) / latest.references.length)} of baseline</T>
                ) : null}
                {s.key === 'read' && i < stage && a && newScanId === latest?.id ? (
                  <T v="small" style={{ marginLeft: 'auto' }}>{a.usable}/{a.total} sites</T>
                ) : null}
              </View>
            ))}
          </View>
          <T v="small" style={{ marginTop: space.md, color: colors.textMuted }}>Demo mode: stages are simulated. With hardware, each stage follows the case's own status.</T>
        </View>
      )}

      {step === 'results' && a && (
        <View style={styles.body}>
          <View style={{ height: 300, marginHorizontal: -space.xl }}>
            <RetainerView key={store.arch} arch={store.arch} style={{ flex: 1 }} regions={regions} reveal active={focused} />
          </View>
          <View style={{ alignItems: 'center', marginBottom: space.sm }}>
            <ArchToggle />
          </View>
          <BiomarkerLegend mode="overview" only={[...new Set((a.results ?? []).filter((r) => r.status !== 'normal' && r.status !== 'unavailable').map((r) => r.site.biomarker))]} />
          <T v="display" style={{ marginTop: space.xl }}>Your scan is ready</T>
          <View style={{ marginTop: space.lg }}>
            <ResultLine icon={a.reviewSites.length ? 'alert' : 'check'} text={`${a.reviewSites.length} ${a.reviewSites.length === 1 ? 'area' : 'areas'} to review`} />
            <ResultLine icon="layers" text={`${a.usable} of ${a.total} configured sites analysed`} />
            {a.withheld.length ? <ResultLine icon="info" text={`${a.withheld.length} site${a.withheld.length > 1 ? 's' : ''} withheld: signal below quality floor`} /> : null}
            {a.recalibrate.length ? <ResultLine icon="refresh" text={`${a.recalibrate.length} sensor${a.recalibrate.length > 1 ? 's' : ''} require${a.recalibrate.length > 1 ? '' : 's'} recalibration`} /> : null}
            {a.readoutLate ? <ResultLine icon="clock" text="Read after the readout window: lower confidence" /> : null}
            <ResultLine icon="strip" text={`${store.arch === 'upper' ? 'Upper' : 'Lower'} strip clarity ${health.clarity != null ? pct(health.clarity) : '—'} · replace in ${replaceEta(health).toLowerCase()}`} />
            <ResultLine icon="layers" text="Both retainers were read; switch above to see the other arch" />
          </View>
          <Button label="Explore results" style={{ marginTop: space.xl }} onPress={() => { restart(); router.navigate('/'); }} />
          <Button label="View scan details" kind="secondary" style={{ marginTop: space.md }} onPress={() => latest && router.push({ pathname: '/scan-details', params: { id: latest.id } })} />
          {a.withheld.length || a.readoutLate ? (
            <Button
              label={health.state === 'now' || health.state === 'soon' ? 'Replace strip, then retry' : 'Retry scan'}
              kind="ghost"
              icon="refresh"
              style={{ marginTop: space.sm }}
              onPress={() => (health.state === 'now' || health.state === 'soon' ? router.push('/strip') : restart())}
            />
          ) : null}
          <Pressable onPress={restart} style={{ alignSelf: 'center', marginTop: space.md }}>
            <T v="small">Done</T>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

function ResultLine({ icon, text }: { icon: 'alert' | 'check' | 'layers' | 'info' | 'refresh' | 'clock' | 'strip'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <Icon name={icon} size={18} color={colors.textSecondary} />
      <T v="body" style={{ color: colors.text }}>{text}</T>
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={styles.stepper}>
      <T v="bodyStrong" style={{ fontSize: 18, lineHeight: 20 }}>{label}</T>
    </Pressable>
  );
}

function TimerRing({ progress, size, children }: { progress: number; size: number; children: React.ReactNode }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', marginTop: space.xxl }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.hairlineStrong} strokeWidth={2} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.text}
          strokeWidth={2}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - progress)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progress: { flexDirection: 'row', gap: 4, paddingHorizontal: space.xl, marginTop: space.md },
  progSeg: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.hairlineStrong },
  body: { paddingHorizontal: space.xl },
  check: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  box: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  stepper: { width: 32, height: 32, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  stageDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
});
