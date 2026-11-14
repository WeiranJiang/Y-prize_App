/**
 * Deterministic demo data. Everything here is SIMULATED and is labelled
 * "Demo data" in the UI. The generator uses a simple optical model so the
 * biofouling analytics behave the way real data would:
 *
 *   • Biofilm attenuates every transmitter as  T = exp(−k · f · h)
 *     (h = in-mouth exposure hours, f = location fouling factor).
 *   • Inert reference spots see only that attenuation — no chemistry — so
 *     they measure fouling directly.
 *   • pH is read ratiometrically, so attenuation mostly costs signal-to-noise
 *     (wider uncertainty) rather than biasing the value. Sites whose SNR falls
 *     below the floor are withheld, never filled in.
 */
import type { BiomarkerId } from './biomarkers';
import type { ReferenceReading, Scan, SensingSite, SiteReading, Strip, StripLimits } from './types';

export const DEFAULT_LIMITS: StripLimits = {
  maxDays: 14,
  maxSessions: 20,
  clarityReplace: 0.65,
  claritySoon: 0.72,
  snrFloor: 15,
  usableMin: 0.85,
};

const SNR0 = 31;
const SNR_GOOD = 24;
const K_FOUL = 0.0041; // per exposure hour
const PKA = 6.4;
const R_MIN = 0.2;
const R_MAX = 2.4;

function site(
  id: string,
  toothUniversal: number,
  surface: SensingSite['surface'],
  role: SensingSite['role'] = 'measure',
  biomarker: BiomarkerId = 'pH',
): SensingSite {
  return {
    id,
    toothUniversal,
    surface,
    biomarker,
    role,
    footprintMm: 1.6,
    transmitters: [`${id}-a`, `${id}-b`, `${id}-c`],
  };
}

export const SITE_TEMPLATE: SensingSite[] = [
  site('S01', 3, 'mesial'),
  site('S02', 3, 'gingival'),
  site('S03', 2, 'buccal'),
  site('S04', 4, 'buccal'),
  site('S05', 6, 'gingival'),
  site('S06', 8, 'gingival'),
  site('S07', 9, 'lingual', 'comparison'),
  site('S08', 10, 'buccal'),
  site('S09', 11, 'gingival'),
  site('S10', 14, 'mesial'),
  site('S11', 14, 'gingival'),
  site('S12', 15, 'buccal'),
];

export const REF_TEMPLATE = [
  { id: 'R1', label: 'Right posterior reference', toothUniversal: 3, surface: 'lingual' as const },
  { id: 'R2', label: 'Anterior reference', toothUniversal: 8, surface: 'lingual' as const },
  { id: 'R3', label: 'Left posterior reference', toothUniversal: 14, surface: 'lingual' as const },
];

/** Location-dependent fouling factors (posterior & gingival areas foul faster). */
const FOUL: Record<string, number> = {
  S01: 1.25, S02: 1.45, S03: 1.3, S04: 1.1, S05: 0.95, S06: 0.85, S07: 0.8,
  S08: 0.85, S09: 1.0, S10: 1.3, S11: 2.6, S12: 1.35,
  R1: 1.1, R2: 0.8, R3: 1.15,
};
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

export function makeStrip(id: string, batch: string, installedAt: Date, calibrationVersion: string): Strip {
  return {
    id,
    batch,
    installedAt: installedAt.toISOString(),
    calibrationVersion,
    supported: ['pH'],
    sites: SITE_TEMPLATE.map((s) => ({ ...s, transmitters: s.transmitters.map((t) => `${id}-${t}`) })),
    referenceSpots: REF_TEMPLATE,
  };
}

/** "True" local pH used by the simulator, as a function of global session number. */
function truePH(siteId: string, n: number, r: () => number): number {
  const noise = gauss(r) * 0.08;
  switch (siteId) {
    case 'S01': // recurring, worsening acidity at the upper-right first molar mesial site
      return 6.45 - Math.min(1.15, Math.max(0, n - 4) * 0.075) + noise;
    case 'S02':
      return 6.32 + noise * 0.8;
    case 'S03':
      return 6.62 + noise;
    case 'S04':
      return 6.74 + noise;
    case 'S10': // new: only the last couple of sessions dip
      return (n >= 21 ? 5.82 : 6.6) + noise;
    case 'S07':
      return 6.82 + noise * 0.6;
    case 'S12':
      return 6.55 + noise;
    default:
      return 6.95 + noise;
  }
}

function phToRatio(pH: number) {
  // Henderson–Hasselbalch style sigmoid between the two emission bands.
  const x = Math.pow(10, pH - PKA);
  return (R_MIN + R_MAX * x) / (1 + x);
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
    const T = Math.min(1, Math.exp(-K_FOUL * (FOUL[s.id] ?? 1) * i.exposureHours) * (1 + gauss(r) * 0.01));
    const snr = SNR0 * T * (late ? 0.92 : 1);
    const drift = 0.00075 * (DRIFT[s.id] ?? 1) * i.exposureHours;
    const ph = truePH(s.id, i.globalIndex, r);
    const ratio = phToRatio(ph) * (1 + gauss(r) / Math.max(snr, 1) * 0.6);
    const counts = Math.round(42000 * T);
    const usable = snr >= i.limits.snrFloor;
    const qRaw = Math.max(0, Math.min(1, (snr - i.limits.snrFloor) / (SNR_GOOD - i.limits.snrFloor)));
    const quality = usable ? Math.max(0.05, qRaw * (late ? 0.75 : 1) - Math.min(0.3, drift)) : 0;
    const uncertainty = 0.04 + 0.6 / Math.max(snr, 1) + drift * 0.5;
    let note: string | undefined;
    if (!usable) note = 'Optical signal below quality floor — likely local film build-up on the strip.';
    else if (late) note = 'Read after the readout window; value may not reflect in-mouth conditions.';
    return {
      siteId: s.id,
      biomarker: s.biomarker,
      rawRatio: Number(ratio.toFixed(3)),
      rawCounts: counts,
      value: usable ? Number((ph + drift * 0.4).toFixed(2)) : null,
      uncertainty: Number(uncertainty.toFixed(2)),
      snr: Number(snr.toFixed(1)),
      quality: Number(quality.toFixed(2)),
      transmission: Number(T.toFixed(3)),
      drift: Number(drift.toFixed(3)),
      health: !usable ? 'failed' : T < 0.6 ? 'degraded' : 'ok',
      calibration: drift > 0.12 ? 'recalibrate' : 'ok',
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
 * Build ~4 weeks of history: a previous strip retired when its clarity fell
 * below the limit, a three-day gap, then the current strip at day 10.
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
  const stripA = makeStrip('STR-0418', 'B24-0418', morning(27, 7, 55), 'cal-2.3');
  const stripB = makeStrip('STR-0531', 'B24-0531', morning(9, 7, 50), 'cal-2.4');
  const scans: Scan[] = [];
  let g = 0;

  // Strip A: 13 sessions over 14 days (one missed day), retired by clarity.
  const aDays = [27, 26, 25, 24, 23, 21, 20, 19, 18, 17, 16, 15, 14];
  aDays.forEach((d, idx) => {
    g++;
    const exposure = (27 - d) * 9.0;
    scans.push(
      simulateScan({
        strip: stripA, at: morning(d, 8, 30 + (idx % 3) * 7), sessionIndex: idx + 1, globalIndex: g,
        exposureHours: exposure, sessionMinutes: 10, readoutDelayMin: d === 20 ? 9 : 1.5 + (idx % 3) * 0.4,
        readoutWindowMin: 5, limits, seed: 1000 + g,
      }),
    );
  });
  stripA.retiredAt = morning(13, 21, 10).toISOString();
  stripA.retiredReason = 'Optical clarity reached the replacement limit';

  // Strip B: current, installed 9 days ago, 8 sessions (missed one day).
  const bDays = [9, 8, 7, 6, 4, 3, 2, 1, 0];
  bDays.forEach((d, idx) => {
    g++;
    const exposure = (9 - d) * 9.0;
    scans.push(
      simulateScan({
        strip: stripB, at: morning(d), sessionIndex: idx + 1, globalIndex: g,
        exposureHours: exposure, sessionMinutes: 10, readoutDelayMin: 1.6 + (idx % 2) * 0.5,
        readoutWindowMin: 5, limits, seed: 2000 + g,
      }),
    );
  });

  return { strips: [stripA, stripB], scans, globalCount: g };
}

/** Simulate one more scan on the current strip (used by the Scan flow in demo mode). */
export function simulateNextScan(
  strip: Strip,
  prev: Scan | undefined,
  globalIndex: number,
  sessionMinutes: number,
  readoutWindowMin: number,
  limits: StripLimits,
  now = new Date(),
): Scan {
  const elapsedH = prev ? (now.getTime() - new Date(prev.at).getTime()) / 3600000 : 0;
  // Exposure grows with time out of the case; in the demo we cap a rapid re-scan at the session length.
  const added = prev ? Math.min(9, Math.max(sessionMinutes / 60, elapsedH * 0.38)) : 0;
  return simulateScan({
    strip,
    at: now,
    sessionIndex: (prev?.stripId === strip.id ? prev.sessionIndex : 0) + 1,
    globalIndex,
    exposureHours: prev?.stripId === strip.id ? prev.exposureHours + added : 0,
    sessionMinutes,
    readoutDelayMin: 1.2,
    readoutWindowMin,
    limits,
    seed: 5000 + globalIndex,
  });
}
