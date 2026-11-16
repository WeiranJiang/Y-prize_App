/**
 * Deterministic demo data. Everything here is SIMULATED and is labelled
 * "Demo data" in the UI. The generator uses a simple optical model so the
 * biofouling analytics behave the way real data would:
 *
 *   • Biofilm attenuates every transmitter as  T = exp(−k · f · h)
 *     (h = in-mouth exposure hours, f = location fouling factor).
 *   • Inert reference spots see only that attenuation — no chemistry — so
 *     they measure fouling directly.
 *   • Readings are ratiometric, so attenuation mostly costs signal-to-noise
 *     (wider uncertainty) rather than biasing the value. Sites whose SNR falls
 *     below the floor are withheld, never filled in.
 *
 * Both arches carry a strip that measures pH, lactate, calcium, phosphate,
 * fluoride and ammonium at separate microscopic sensing sites.
 */
import { BIOMARKERS, BiomarkerId } from './biomarkers';
import type { Arch } from './teeth';
import { toothByUniversal } from './teeth';
import type { ReferenceReading, Scan, SensingSite, SiteReading, Strip, StripLimits } from './types';

export const DEFAULT_LIMITS: StripLimits = {
  maxDays: 14,
  maxSessions: 20,
  clarityReplace: 0.65,
  claritySoon: 0.72,
  snrFloor: 15,
  usableMin: 0.85,
};

const ALL: BiomarkerId[] = ['pH', 'lactate', 'calcium', 'phosphate', 'fluoride', 'ammonium'];
const SNR0 = 31;
const SNR_GOOD = 24;
const K_FOUL = 0.0041; // per exposure hour
const R_MIN = 0.2;
const R_MAX = 2.4;

function site(
  id: string,
  toothUniversal: number,
  surface: SensingSite['surface'],
  biomarker: BiomarkerId = 'pH',
  opts: { role?: SensingSite['role']; offset?: [number, number] } = {},
): SensingSite {
  return {
    id,
    toothUniversal,
    surface,
    biomarker,
    role: opts.role ?? 'measure',
    footprintMm: 1.6,
    transmitters: [`${id}-a`, `${id}-b`, `${id}-c`],
    offset: opts.offset,
  };
}

/** Upper strip: 12 pH sites + 16 sites for the other biomarkers. */
export const UPPER_SITES: SensingSite[] = [
  site('S01', 3, 'mesial'),
  site('S02', 3, 'gingival'),
  site('S03', 2, 'buccal'),
  site('S04', 4, 'buccal'),
  site('S05', 6, 'gingival'),
  site('S06', 8, 'gingival'),
  site('S07', 9, 'lingual', 'pH', { role: 'comparison' }),
  site('S08', 10, 'buccal'),
  site('S09', 11, 'gingival'),
  site('S10', 14, 'mesial'),
  site('S11', 14, 'gingival'),
  site('S12', 15, 'buccal'),
  site('L01', 3, 'mesial', 'lactate', { offset: [0.4, -2.2] }),
  site('L02', 14, 'mesial', 'lactate', { offset: [0.4, -2.2] }),
  site('L03', 8, 'gingival', 'lactate', { offset: [2.2, 0] }),
  site('L04', 11, 'buccal', 'lactate', { offset: [0, 1.6] }),
  site('C01', 3, 'buccal', 'calcium', { offset: [0, 1.4] }),
  site('C02', 9, 'lingual', 'calcium', { offset: [2.2, 0] }),
  site('C03', 14, 'buccal', 'calcium', { offset: [0, 1.4] }),
  site('C04', 5, 'gingival', 'calcium'),
  site('P01', 4, 'buccal', 'phosphate', { offset: [0, 2.6] }),
  site('P02', 13, 'buccal', 'phosphate'),
  site('P03', 10, 'lingual', 'phosphate'),
  site('F01', 8, 'buccal', 'fluoride'),
  site('F02', 2, 'lingual', 'fluoride'),
  site('F03', 15, 'lingual', 'fluoride'),
  site('A01', 6, 'buccal', 'ammonium'),
  site('A02', 12, 'gingival', 'ammonium'),
  site('S13', 5, 'buccal'),
  site('S14', 12, 'buccal'),
  site('C05', 13, 'gingival', 'calcium'),
  site('P04', 14, 'distal', 'phosphate'),
];

/** Lower strip. */
export const LOWER_SITES: SensingSite[] = [
  site('S21', 19, 'distal'),
  site('S22', 19, 'gingival'),
  site('S23', 30, 'buccal'),
  site('S24', 24, 'lingual', 'pH', { role: 'comparison' }),
  site('S25', 25, 'gingival'),
  site('S26', 27, 'gingival'),
  site('S27', 22, 'buccal'),
  site('S28', 29, 'mesial'),
  site('L21', 19, 'distal', 'lactate', { offset: [-0.4, -2.2] }),
  site('L22', 30, 'mesial', 'lactate'),
  site('C21', 24, 'lingual', 'calcium', { offset: [-1.6, -1.6] }),
  site('C22', 30, 'buccal', 'calcium', { offset: [0, 2.2] }),
  site('P21', 28, 'buccal', 'phosphate'),
  site('F21', 25, 'buccal', 'fluoride'),
  site('A21', 23, 'lingual', 'ammonium'),
  site('C23', 19, 'buccal', 'calcium'),
  site('F22', 19, 'lingual', 'fluoride', { offset: [1.6, 0] }),
  site('A22', 30, 'lingual', 'ammonium', { offset: [1.6, 0] }),
  site('S29', 31, 'buccal'),
  site('S30', 18, 'buccal'),
];

export const REF_TEMPLATE: Record<Arch, Strip['referenceSpots']> = {
  upper: [
    { id: 'R1', label: 'Right posterior reference', toothUniversal: 3, surface: 'lingual' },
    { id: 'R2', label: 'Anterior reference', toothUniversal: 8, surface: 'lingual' },
    { id: 'R3', label: 'Left posterior reference', toothUniversal: 14, surface: 'lingual' },
  ],
  lower: [
    { id: 'R4', label: 'Left posterior reference', toothUniversal: 19, surface: 'lingual' },
    { id: 'R5', label: 'Anterior reference', toothUniversal: 25, surface: 'lingual' },
    { id: 'R6', label: 'Right posterior reference', toothUniversal: 30, surface: 'lingual' },
  ],
};

/** Location-dependent fouling factors (posterior & gingival areas foul faster). */
const FOUL: Record<string, number> = {
  S01: 1.25, S02: 1.45, S03: 1.3, S04: 1.1, S05: 0.95, S06: 0.85, S07: 0.8,
  S08: 0.85, S09: 1.0, S10: 1.3, S11: 2.6, S12: 1.35,
  R1: 1.1, R2: 0.8, R3: 1.15, R4: 1.1, R5: 0.85, R6: 1.1,
};
function foulFactor(s: SensingSite) {
  if (FOUL[s.id]) return FOUL[s.id];
  const pos = toothByUniversal(s.toothUniversal).position;
  return 0.72 + 0.07 * pos + (s.surface === 'gingival' ? 0.3 : 0) + (s.surface === 'mesial' || s.surface === 'distal' ? 0.15 : 0) - (s.surface === 'lingual' ? 0.05 : 0);
}
/** Per-site drift multipliers (S12's chemistry ages faster — triggers a recalibration flag). */
const DRIFT: Record<string, number> = { S12: 2.6 };

// ── Seeded PRNG ────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(r: () => number) {
  const u = Math.max(1e-9, r());
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function makeStrip(id: string, arch: Arch, batch: string, installedAt: Date, calibrationVersion: string): Strip {
  const template = arch === 'upper' ? UPPER_SITES : LOWER_SITES;
  return {
    id,
    arch,
    batch,
    installedAt: installedAt.toISOString(),
    calibrationVersion,
    supported: ALL,
    sites: template.map((s) => ({ ...s, transmitters: s.transmitters.map((t) => `${id}-${t}`) })),
    referenceSpots: REF_TEMPLATE[arch],
  };
}

const ramp = (n: number, from: number, per: number, max: number) => Math.min(max, Math.max(0, n - from) * per);

/**
 * "True" local value used by the simulator, as a function of the global
 * session number n (1 … ~22 in the built-in history; the latest is 22).
 */
function trueValue(s: SensingSite, n: number, r: () => number): number {
  const g = gauss(r);
  switch (s.id) {
    // ── Upper pH ──
    case 'S01': return 6.45 - ramp(n, 4, 0.075, 1.15) + g * 0.08; // recurring, worsening acidity (#3 mesial)
    case 'S02': return 6.32 + g * 0.06;
    case 'S03': return 6.62 + g * 0.08;
    case 'S04': return 6.74 + g * 0.08;
    case 'S07': return 6.82 + g * 0.05;
    case 'S10': return (n >= 21 ? 5.82 : 6.6) + g * 0.08; // new dip
    case 'S12': return 6.55 + g * 0.08;
    // ── Upper other biomarkers ──
    case 'L01': return 1.8 + ramp(n, 6, 0.42, 6.2) + g * 0.25; // lactate rising alongside S01's acidity
    case 'L02': return (n >= 21 ? 5.7 : 1.6) + g * 0.2;
    case 'L03': return 1.1 + g * 0.15;
    case 'L04': return 1.3 + g * 0.15;
    case 'C01': return 1.08 - ramp(n, 8, 0.035, 0.46) + g * 0.03; // calcium falling at #3 buccal
    case 'C02': return 1.35 + g * 0.04;
    case 'C03': return 1.12 - ramp(n, 12, 0.03, 0.2) + g * 0.03; // drifting low at #14
    case 'C05': return 1.15 + g * 0.04;
    case 'P04': return 3.4 - ramp(n, 10, 0.08, 0.9) + g * 0.1; // phosphate falling at #14 distal
    case 'C04': return 0.88 + g * 0.03; // slightly low
    case 'P01': return 4.3 + g * 0.15;
    case 'P02': return 2.7 + g * 0.12; // slightly low
    case 'P03': return 4.0 + g * 0.15;
    case 'F01': return 0.09 + g * 0.005;
    case 'F02': return 0.042 + g * 0.003; // slightly low
    case 'F03': return 0.07 + g * 0.004;
    case 'A01': return 4.2 + g * 0.2;
    case 'A02': return 2.55 + g * 0.15; // slightly low
    // ── Lower ──
    case 'S21': return (n >= 21 ? 5.78 : 6.25) + g * 0.07; // new dip at #19 distal
    case 'S22': return 6.42 + g * 0.06; // mild
    case 'S23': return 6.8 + g * 0.07;
    case 'S24': return 6.9 + g * 0.05;
    case 'S25': return 7.02 + g * 0.06;
    case 'S28': return 6.62 + g * 0.07;
    case 'L21': return (n >= 21 ? 5.9 : 2.4) + g * 0.25;
    case 'L22': return 1.4 + g * 0.15;
    case 'C21': return 1.5 + g * 0.04;
    case 'C22': return 0.94 + g * 0.03; // slightly low
    case 'P21': return 4.5 + g * 0.15;
    case 'F21': return 0.06 + g * 0.004;
    case 'A21': return 5.0 + g * 0.2;
    case 'C23': return 1.1 - ramp(n, 4, 0.032, 0.55) + g * 0.03; // calcium falling at #19
    case 'F22': return 0.06 - ramp(n, 14, 0.0025, 0.022) + g * 0.003;
    case 'A22': return 4.3 + g * 0.2;
    case 'S29': return 6.75 + g * 0.07;
    case 'S30': return 6.6 + g * 0.07;
    default: return 6.95 + g * 0.08;
  }
}

export interface ScanInput {
  strip: Strip;
  at: Date;
  sessionIndex: number;
  globalIndex: number;
  exposureHours: number;
  sessionMinutes: number;
  readoutDelayMin: number;
  readoutWindowMin: number;
  limits: StripLimits;
  seed: number;
}

export function simulateScan(i: ScanInput): Scan {
  const r = mulberry32(i.seed);
  const late = i.readoutDelayMin > i.readoutWindowMin;
  const references: ReferenceReading[] = i.strip.referenceSpots.map((spot) => {
    const T = Math.exp(-K_FOUL * (FOUL[spot.id] ?? 1) * i.exposureHours) * (1 + gauss(r) * 0.008);
    return { spotId: spot.id, transmission: Math.min(1, T), snr: SNR0 * T };
  });
  const readings: SiteReading[] = i.strip.sites.map((s) => {
    const b = BIOMARKERS[s.biomarker];
    const span = b.range[1] - b.range[0];
    const T = Math.min(1, Math.exp(-K_FOUL * foulFactor(s) * i.exposureHours) * (1 + gauss(r) * 0.01));
    const snr = SNR0 * T * (late ? 0.92 : 1);
    const drift = 0.00075 * (span / 3.3) * (DRIFT[s.id] ?? 1) * i.exposureHours;
    const v = Math.max(b.range[0] + span * 0.01, trueValue(s, i.globalIndex, r));
    const norm = (v - b.range[0]) / span;
    const ratio = (R_MIN + (R_MAX - R_MIN) * norm) * (1 + (gauss(r) / Math.max(snr, 1)) * 0.6);
    const counts = Math.round(42000 * T);
    const usable = snr >= i.limits.snrFloor;
    const qRaw = Math.max(0, Math.min(1, (snr - i.limits.snrFloor) / (SNR_GOOD - i.limits.snrFloor)));
    const quality = usable ? Math.max(0.05, qRaw * (late ? 0.75 : 1) - Math.min(0.3, drift / (span / 3.3))) : 0;
    const uncertainty = b.unc[0] + b.unc[1] / Math.max(snr, 1) + drift * 0.5;
    let note: string | undefined;
    if (!usable) note = 'Optical signal below quality floor. Likely local film build-up on the strip.';
    else if (late) note = 'Read after the readout window; value may not reflect in-mouth conditions.';
    const dp = b.decimals + 1;
    return {
      siteId: s.id,
      biomarker: s.biomarker,
      rawRatio: Number(ratio.toFixed(3)),
      rawCounts: counts,
      value: usable ? Number((v + drift * 0.4).toFixed(dp)) : null,
      uncertainty: Number(uncertainty.toFixed(dp)),
      snr: Number(snr.toFixed(1)),
      quality: Number(quality.toFixed(2)),
      transmission: Number(T.toFixed(3)),
      drift: Number(drift.toFixed(dp + 1)),
      health: !usable ? 'failed' : T < 0.6 ? 'degraded' : 'ok',
      calibration: drift > 0.12 * (span / 3.3) ? 'recalibrate' : 'ok',
      note,
    };
  });
  return {
    id: `scan-${i.strip.id}-${i.sessionIndex}`,
    at: i.at.toISOString(),
    stripId: i.strip.id,
    sessionIndex: i.sessionIndex,
    sessionMinutes: i.sessionMinutes,
    exposureHours: Number(i.exposureHours.toFixed(1)),
    readoutDelayMin: i.readoutDelayMin,
    readoutWindowMin: i.readoutWindowMin,
    calibrationVersion: i.strip.calibrationVersion,
    readings,
    references,
    demo: true,
    baseline: i.sessionIndex === 1,
  };
}

/**
 * Build ~4 weeks of history for both arches. Upper: a previous strip
 * retired on clarity, a gap, then the current strip at day 10 (replace
 * soon). Lower: current strip fitted 5 days ago (healthy).
 */
export function buildDemoHistory(now: Date, limits: StripLimits = DEFAULT_LIMITS) {
  const day = 86400000;
  // Keep every demo scan in the past: if this morning's 8:42 scan hasn't happened yet, shift the history back a day.
  const today842 = new Date(now);
  today842.setHours(8, 42, 0, 0);
  const shift = today842.getTime() > now.getTime() - 5 * 60000 ? 1 : 0;
  const morning = (daysAgo: number, h = 8, m = 42) => {
    const d = new Date(now.getTime() - (daysAgo + shift) * day);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const upperA = makeStrip('STR-0418', 'upper', 'B24-0418', morning(27, 7, 55), 'cal-2.3');
  const upperB = makeStrip('STR-0531', 'upper', 'B24-0531', morning(9, 7, 50), 'cal-2.4');
  const lowerA = makeStrip('STR-0422', 'lower', 'B24-0422', morning(27, 7, 55), 'cal-2.3');
  const lowerB = makeStrip('STR-0547', 'lower', 'B24-0547', morning(4, 7, 50), 'cal-2.4');
  const scans: Scan[] = [];
  let g = 0;

  const aDays = [27, 26, 25, 24, 23, 21, 20, 19, 18, 17, 16, 15, 14];
  aDays.forEach((d, idx) => {
    g++;
    const at = morning(d, 8, 30 + (idx % 3) * 7);
    const delay = d === 20 ? 9 : 1.5 + (idx % 3) * 0.4;
    for (const strip of [upperA, lowerA]) {
      scans.push(
        simulateScan({
          strip, at, sessionIndex: idx + 1, globalIndex: g, exposureHours: (27 - d) * 9.0,
          sessionMinutes: 10, readoutDelayMin: delay, readoutWindowMin: 5, limits, seed: (strip.arch === 'upper' ? 1000 : 3000) + g,
        }),
      );
    }
  });
  upperA.retiredAt = morning(13, 21, 10).toISOString();
  upperA.retiredReason = 'Optical clarity reached the replacement limit';

  const bDays = [9, 8, 7, 6, 4, 3, 2, 1, 0];
  bDays.forEach((d, idx) => {
    g++;
    const at = morning(d);
    const delay = 1.6 + (idx % 2) * 0.5;
    scans.push(
      simulateScan({
        strip: upperB, at, sessionIndex: idx + 1, globalIndex: g, exposureHours: (9 - d) * 9.0,
        sessionMinutes: 10, readoutDelayMin: delay, readoutWindowMin: 5, limits, seed: 2000 + g,
      }),
    );
    if (d <= 4) {
      const li = bDays.filter((x) => x <= 4).indexOf(d);
      scans.push(
        simulateScan({
          strip: lowerB, at, sessionIndex: li + 1, globalIndex: g, exposureHours: (4 - d) * 9.0,
          sessionMinutes: 10, readoutDelayMin: delay, readoutWindowMin: 5, limits, seed: 4000 + g,
        }),
      );
    }
  });
  lowerA.retiredAt = morning(14, 21, 0).toISOString();
  lowerA.retiredReason = 'Validated use period complete';

  return { strips: [upperA, lowerA, upperB, lowerB], scans };
}
