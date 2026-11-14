import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { BIOMARKERS, Bands } from '../domain/biomarkers';
import { buildDemoHistory, DEFAULT_LIMITS, makeStrip, simulateNextScan } from '../domain/demo';
import { computeStripHealth, StripHealth } from '../domain/fouling';
import { buildInsights, Insight, Recommendation } from '../domain/insights';
import type { ScanAnalysis } from '../domain/analysis';
import type { NumberingSystem } from '../domain/teeth';
import type { Protocol, Scan, Strip, StripLimits } from '../domain/types';

export type CaseStatus = 'connected' | 'disconnected' | 'scanning' | 'syncing';
export type ViewLevel = 'consumer' | 'research';

export interface Settings {
  numbering: NumberingSystem;
  view: ViewLevel;
  protocol: Protocol;
  limits: StripLimits;
  pHBands: Bands;
}

interface State {
  strips: Strip[];
  scans: Scan[];
  currentStripId: string;
  globalCount: number;
  settings: Settings;
  caseStatus: CaseStatus;
  caseBattery: number;
  /** Bumped whenever thresholds change, so derived data recomputes. */
  rev: number;
}

type Action =
  | { type: 'addScan'; scan: Scan }
  | { type: 'replaceStrip'; at: Date }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'case'; status: CaseStatus }
  | { type: 'reset' };

function initial(): State {
  const demo = buildDemoHistory(new Date());
  return {
    strips: demo.strips,
    scans: demo.scans,
    currentStripId: demo.strips[demo.strips.length - 1].id,
    globalCount: demo.globalCount,
    settings: {
      numbering: 'universal',
      view: 'consumer',
      protocol: { sessionMinutes: 10, readoutWindowMin: 5, label: 'Engineering demo protocol' },
      limits: { ...DEFAULT_LIMITS },
      pHBands: { ...BIOMARKERS.pH.bands },
    },
    caseStatus: 'connected',
    caseBattery: 0.82,
    rev: 0,
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'addScan':
      return { ...s, scans: [...s.scans, a.scan], globalCount: s.globalCount + 1 };
    case 'replaceStrip': {
      const n = s.strips.length + 1;
      const id = `STR-${(531 + n * 37).toString().padStart(4, '0')}`;
      const strips = s.strips.map((st) =>
        st.id === s.currentStripId ? { ...st, retiredAt: a.at.toISOString(), retiredReason: 'Replaced by user' } : st,
      );
      const next = makeStrip(id, `B24-${id.slice(4)}`, a.at, 'cal-2.4');
      return { ...s, strips: [...strips, next], currentStripId: id };
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

const DEFAULT_PH = { ...BIOMARKERS.pH.bands };

interface Derived {
  state: State;
  strip: Strip;
  latestScan?: Scan;
  stripScans: Scan[];
  health: StripHealth;
  analysis?: ScanAnalysis;
  insights: Insight[];
  recommendations: Recommendation[];
  dispatch: React.Dispatch<Action>;
  runDemoScan: () => Scan;
  scanById: (id: string) => Scan | undefined;
  stripById: (id: string) => Strip | undefined;
}

const Ctx = createContext<Derived | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  const strip = state.strips.find((s) => s.id === state.currentStripId)!;
  const sorted = useMemo(() => state.scans.slice().sort((a, b) => +new Date(a.at) - +new Date(b.at)), [state.scans]);
  const latestScan = sorted[sorted.length - 1];
  const latestStrip = latestScan ? state.strips.find((s) => s.id === latestScan.stripId) : undefined;
  const stripScans = useMemo(() => sorted.filter((s) => s.stripId === strip.id), [sorted, strip.id]);

  const health = useMemo(
    () => computeStripHealth(strip, sorted, state.settings.limits),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [strip, sorted, state.settings.limits, state.rev],
  );

  const built = useMemo(() => {
    if (!latestScan || !latestStrip) return null;
    const h = latestStrip.id === strip.id ? health : null;
    return buildInsights(latestScan, latestStrip, sorted, h, state.settings.numbering);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestScan, latestStrip, sorted, health, state.settings.numbering, state.rev]);

  const runDemoScan = useCallback(() => {
    const prev = sorted.filter((s) => s.stripId === strip.id).pop();
    const scan = simulateNextScan(
      strip,
      prev,
      state.globalCount + 1,
      state.settings.protocol.sessionMinutes,
      state.settings.protocol.readoutWindowMin,
      state.settings.limits,
    );
    dispatch({ type: 'addScan', scan });
    return scan;
  }, [sorted, strip, state.globalCount, state.settings]);

  const value: Derived = {
    state,
    strip,
    latestScan,
    stripScans,
    health,
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
