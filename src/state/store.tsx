import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import { BIOMARKERS, Bands } from '../domain/biomarkers';
import { buildDemoHistory, DEFAULT_LIMITS, makeStrip } from '../domain/demo';
import { computeStripHealth, StripHealth } from '../domain/fouling';
import { buildInsights, Insight, Recommendation } from '../domain/insights';
import type { ScanAnalysis } from '../domain/analysis';
import type { Arch, NumberingSystem } from '../domain/teeth';
import type { Scan, Strip, StripLimits } from '../domain/types';

export type CaseStatus = 'connected' | 'disconnected' | 'scanning' | 'syncing';

/** Strip supply and reordering (demo — no real orders or payments). */
export interface Plan {
  mode: 'auto' | 'manual';
  /** Strips per arch in each automatic delivery. */
  perBox: Record<Arch, number>;
  /** Ship automatically when spare strips for either arch fall to this many. */
  reorderAt: number;
  paused: boolean;
}
export interface Order {
  id: string;
  placedAt: string;
  qty: Record<Arch, number>;
  kind: 'auto' | 'manual';
  status: 'processing' | 'shipped' | 'delivered';
  eta: string;
}
export type ViewLevel = 'consumer' | 'research';

export interface Settings {
  numbering: NumberingSystem;
  view: ViewLevel;
  /** Which arch every screen is showing. */
  arch: Arch;
  limits: StripLimits;
  pHBands: Bands;
}

interface State {
  strips: Strip[];
  scans: Scan[];
  currentStripIds: Record<Arch, string>;
  settings: Settings;
  caseStatus: CaseStatus;
  caseBattery: number;
  /** Spare strips at home, per arch. */
  supply: Record<Arch, number>;
  plan: Plan;
  orders: Order[];
  /** Bumped whenever thresholds change, so derived data recomputes. */
  rev: number;
}

type Action =
  | { type: 'addScans'; scans: Scan[] }
  | { type: 'replaceStrip'; at: Date }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'case'; status: CaseStatus }
  | { type: 'plan'; patch: Partial<Plan> }
  | { type: 'order'; qty: Record<Arch, number>; kind: 'auto' | 'manual'; at: Date }
  | { type: 'reset' };

function initial(): State {
  const demo = buildDemoHistory(new Date());
  const current = (arch: Arch) => demo.strips.filter((s) => s.arch === arch && !s.retiredAt).pop()!.id;
  return {
    strips: demo.strips,
    scans: demo.scans,
    currentStripIds: { upper: current('upper'), lower: current('lower') },
    settings: {
      numbering: 'universal',
      view: 'consumer',
      arch: 'upper',
      limits: { ...DEFAULT_LIMITS },
      pHBands: { ...BIOMARKERS.pH.bands },
    },
    caseStatus: 'connected',
    caseBattery: 0.82,
    supply: { upper: 1, lower: 2 },
    plan: { mode: 'auto', perBox: { upper: 2, lower: 2 }, reorderAt: 1, paused: false },
    orders: [
      { id: 'ORD-1042', placedAt: daysAgo(30), qty: { upper: 2, lower: 2 }, kind: 'auto', status: 'delivered', eta: daysAgo(27) },
      { id: 'ORD-1067', placedAt: daysAgo(12), qty: { upper: 2, lower: 2 }, kind: 'auto', status: 'delivered', eta: daysAgo(9) },
    ],
    rev: 0,
  };
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const DEFAULT_PH = { ...BIOMARKERS.pH.bands };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'addScans':
      return { ...s, scans: [...new Map([...s.scans, ...a.scans].map(scan => [scan.id, scan])).values()] };
    case 'replaceStrip': {
      const arch = s.settings.arch;
      const n = s.strips.length + 1;
      const id = `STR-${(560 + n * 37).toString().padStart(4, '0')}`;
      const strips = s.strips.map((st) =>
        st.id === s.currentStripIds[arch] ? { ...st, retiredAt: a.at.toISOString(), retiredReason: 'Replaced by user' } : st,
      );
      const next = makeStrip(id, arch, `B24-${id.slice(4)}`, a.at, 'cal-2.4');
      const supply = { ...s.supply, [arch]: Math.max(0, s.supply[arch] - 1) };
      let st: State = { ...s, strips: [...strips, next], currentStripIds: { ...s.currentStripIds, [arch]: id }, supply };
      // Automatic plan: reorder when spares run low and nothing is already on its way.
      const pending = s.orders.some((o) => o.status !== 'delivered');
      if (s.plan.mode === 'auto' && !s.plan.paused && !pending && Math.min(supply.upper, supply.lower) <= s.plan.reorderAt) {
        st = reducer(st, { type: 'order', qty: s.plan.perBox, kind: 'auto', at: a.at });
      }
      return st;
    }
    case 'settings': {
      const settings = { ...s.settings, ...a.patch };
      // Thresholds are configurable research settings; apply to the registry.
      BIOMARKERS.pH.bands = { ...settings.pHBands };
      return { ...s, settings, rev: s.rev + 1 };
    }
    case 'case':
      return { ...s, caseStatus: a.status };
    case 'plan':
      return { ...s, plan: { ...s.plan, ...a.patch } };
    case 'order': {
      const n = 1068 + s.orders.length;
      const eta = new Date(a.at.getTime() + 3 * 86400000).toISOString();
      return { ...s, orders: [{ id: `ORD-${n}`, placedAt: a.at.toISOString(), qty: a.qty, kind: a.kind, status: 'processing', eta }, ...s.orders] };
    }
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
