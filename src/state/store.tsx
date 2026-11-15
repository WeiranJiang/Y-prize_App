import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { BIOMARKERS, Bands } from '../domain/biomarkers';
import { buildDemoHistory, DEFAULT_LIMITS, makeStrip, simulateNextScan } from '../domain/demo';
import { computeStripHealth, StripHealth } from '../domain/fouling';
import { buildInsights, Insight, Recommendation } from '../domain/insights';
import type { ScanAnalysis } from '../domain/analysis';
import type { Arch, NumberingSystem } from '../domain/teeth';
import type { Protocol, Scan, Strip, StripLimits } from '../domain/types';

export type CaseStatus = 'connected' | 'disconnected' | 'scanning' | 'syncing';
export type ViewLevel = 'consumer' | 'research';

export interface Settings {
  numbering: NumberingSystem;
  view: ViewLevel;
  /** Which arch every screen is showing. */
  arch: Arch;
  protocol: Protocol;
  limits: StripLimits;
  pHBands: Bands;
}

interface State {
  strips: Strip[];
  scans: Scan[];
  currentStripIds: Record<Arch, string>;
  globalCount: number;
  settings: Settings;
  caseStatus: CaseStatus;
  caseBattery: number;
  /** Bumped whenever thresholds change, so derived data recomputes. */
  rev: number;
}

type Action =
  | { type: 'addScans'; scans: Scan[] }
  | { type: 'replaceStrip'; at: Date }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'case'; status: CaseStatus }
  | { type: 'reset' };

function initial(): State {
  const demo = buildDemoHistory(new Date());
  const current = (arch: Arch) => demo.strips.filter((s) => s.arch === arch && !s.retiredAt).pop()!.id;
  return {
    strips: demo.strips,
    scans: demo.scans,
    currentStripIds: { upper: current('upper'), lower: current('lower') },
    globalCount: demo.globalCount,
    settings: {
      numbering: 'universal',
      view: 'consumer',
      arch: 'upper',
      protocol: { sessionMinutes: 10, readoutWindowMin: 5, label: 'Engineering demo protocol' },
      limits: { ...DEFAULT_LIMITS },
      pHBands: { ...BIOMARKERS.pH.bands },
    },
    caseStatus: 'connected',
    caseBattery: 0.82,
    rev: 0,
  };
}

const DEFAULT_PH = { ...BIOMARKERS.pH.bands };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'addScans':
      return { ...s, scans: [...s.scans, ...a.scans], globalCount: s.globalCount + 1 };
    case 'replaceStrip': {
      const arch = s.settings.arch;
      const n = s.strips.length + 1;
      const id = `STR-${(560 + n * 37).toString().padStart(4, '0')}`;
      const strips = s.strips.map((st) =>
        st.id === s.currentStripIds[arch] ? { ...st, retiredAt: a.at.toISOString(), retiredReason: 'Replaced by user' } : st,
      );
      const next = makeStrip(id, arch, `B24-${id.slice(4)}`, a.at, 'cal-2.4');
      return { ...s, strips: [...strips, next], currentStripIds: { ...s.currentStripIds, [arch]: id } };
    }
    case 'settings': {
      const settings = { ...s.settings, ...a.patch };
      // Thresholds are configurable research settings; apply to the registry.
      BIOMARKERS.pH.bands = { ...settings.pHBands };
      return { ...s, settings, rev: s.rev + 1 };
    }
    case 'case':
      return { ...s, caseStatus: a.status };
    case 'reset':
      BIOMARKERS.pH.bands = { ...DEFAULT_PH };
      return initial();
  }
}

interface Derived {
  state: State;
  arch: Arch;
  setArch: (a: Arch) => void;
  /** Current strip of the selected arch. */
  strip: Strip;
  stripFor: (a: Arch) => Strip;
  latestScan?: Scan;
  latestScanFor: (a: Arch) => Scan | undefined;
  stripScans: Scan[];
  health: StripHealth;
  healthFor: (a: Arch) => StripHealth;
  analysis?: ScanAnalysis;
  insights: Insight[];
  recommendations: Recommendation[];
  dispatch: React.Dispatch<Action>;
  /** Simulate a case readout of both retainers; returns the selected arch's scan. */
  runDemoScan: () => Scan;
  scanById: (id: string) => Scan | undefined;
  stripById: (id: string) => Strip | undefined;
}

const Ctx = createContext<Derived | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const arch = state.settings.arch;

  const sorted = useMemo(() => state.scans.slice().sort((a, b) => +new Date(a.at) - +new Date(b.at)), [state.scans]);
  const stripFor = useCallback((a: Arch) => state.strips.find((s) => s.id === state.currentStripIds[a])!, [state.strips, state.currentStripIds]);
  const archStripIds = useMemo(() => new Set(state.strips.filter((s) => s.arch === arch).map((s) => s.id)), [state.strips, arch]);
  const archScans = useMemo(() => sorted.filter((s) => archStripIds.has(s.stripId)), [sorted, archStripIds]);
  const latestScanFor = useCallback(
    (a: Arch) => {
      const ids = new Set(state.strips.filter((s) => s.arch === a).map((s) => s.id));
      return sorted.filter((s) => ids.has(s.stripId)).pop();
    },
    [sorted, state.strips],
  );

  const strip = stripFor(arch);
  const latestScan = archScans[archScans.length - 1];
  const latestStrip = latestScan ? state.strips.find((s) => s.id === latestScan.stripId) : undefined;
  const stripScans = useMemo(() => sorted.filter((s) => s.stripId === strip.id), [sorted, strip.id]);

  const healthFor = useCallback((a: Arch) => computeStripHealth(stripFor(a), sorted, state.settings.limits), [stripFor, sorted, state.settings.limits]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const health = useMemo(() => healthFor(arch), [healthFor, arch, state.rev]);

  const built = useMemo(() => {
    if (!latestScan || !latestStrip) return null;
    const h = latestStrip.id === strip.id ? health : null;
    return buildInsights(latestScan, latestStrip, archScans, h, state.settings.numbering);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestScan, latestStrip, archScans, health, state.settings.numbering, state.rev]);

  const runDemoScan = useCallback(() => {
    const now = new Date();
    const scans = (['upper', 'lower'] as Arch[]).map((a) => {
      const st = stripFor(a);
      const prev = sorted.filter((s) => s.stripId === st.id).pop();
      return simulateNextScan(st, prev, state.globalCount + 1, state.settings.protocol.sessionMinutes, state.settings.protocol.readoutWindowMin, state.settings.limits, now);
    });
    dispatch({ type: 'addScans', scans });
    return scans[arch === 'upper' ? 0 : 1];
  }, [sorted, stripFor, state.globalCount, state.settings, arch]);

  const value: Derived = {
    state,
    arch,
    setArch: (a) => dispatch({ type: 'settings', patch: { arch: a } }),
    strip,
    stripFor,
    latestScan,
    latestScanFor,
    stripScans,
    health,
    healthFor,
    analysis: built?.analysis,
    insights: built?.insights ?? [],
    recommendations: built?.recommendations ?? [],
    dispatch,
    runDemoScan,
    scanById: (id) => state.scans.find((s) => s.id === id),
    stripById: (id) => state.strips.find((s) => s.id === id),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore outside StoreProvider');
  return v;
}
