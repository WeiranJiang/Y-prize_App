/**
 * Deterministic demo data. Everything here is SIMULATED, as explained
 * on the About page. The generator uses a simple optical model so the
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
 * Both arches use the supplied five-biomarker sensor layout. aMMP-8 values remain uncalibrated.
 */
import { BIOMARKERS, BIOMARKER_ORDER, BiomarkerId } from './biomarkers';
import { sitesForArch, referencesForArch } from './sensorLayout';
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

const ALL: BiomarkerId[] = BIOMARKER_ORDER;
const SNR0 = 31;
const SNR_GOOD = 24;
const K_FOUL = 0.0041; // per exposure hour
const R_MIN = 0.2;
const R_MAX = 2.4;

export const UPPER_SITES = sitesForArch('upper');
export const LOWER_SITES = sitesForArch('lower');

// Legacy optical clarity controls remain internal to simulated strip-health calculations.
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
const FOUL: Record<string, number> = { R1: 1.1, R2: 0.8, R3: 1.15, R4: 1.1, R5: 0.85, R6: 1.1 };
function foulFactor(s: SensingSite) {
  if (FOUL[s.id]) return FOUL[s.id];
  const pos = toothByUniversal(s.toothUniversal).position;
  return 0.72 + 0.07 * pos + (s.height === 'gingival-margin' ? 0.3 : 0) + (s.surface === 'mesial' || s.surface === 'distal' ? 0.15 : 0) - (s.surface === 'lingual' ? 0.05 : 0);
}
/** Synthetic drift is an optical-demo parameter, not a claim about a real sensor. */
const DRIFT: Record<string, number> = {};

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
    sensorReferences: referencesForArch(arch),
  };
}

const ramp = (n: number, from: number, per: number, max: number) => Math.min(max, Math.max(0, n - from) * per);

/**
 * "True" local value used by the simulator, as a function of the global
 * session number n (1 … ~22 in the built-in history; the latest is 22).
 */
function trueValue(s: SensingSite, n: number, r: () => number): number {
  const g = gauss(r);
  switch (s.biomarker) {
    case 'pH': return s.id === 'PH006' ? 6.4 - ramp(n, 4, 0.075, 1.15) + g * 0.06 : 6.8 + g * 0.08;
    case 'calcium': return s.contactWith ? 1.1 - ramp(n, 8, 0.025, 0.4) + g * 0.03 : 1.3 + g * 0.04;
    case 'fluoride': return 0.08 + g * 0.005;
    case 'ammonium': return 4.2 + g * 0.2;
    case 'aMMP8': return 0; // Not exposed as a reading: calibration has not been supplied.
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
    if (s.biomarker === 'aMMP8') note = 'Sensor location configured; calibration and reference-corrected values not supplied.';
    else if (!usable) note = 'Optical signal below quality floor. Likely local film build-up on the strip.';
    else if (late) note = 'Read after the readout window; value may not reflect in-mouth conditions.';
    const dp = b.decimals + 1;
    return {
      siteId: s.id,
      biomarker: s.biomarker,
      rawRatio: Number(ratio.toFixed(3)),
      rawCounts: counts,
      value: s.biomarker === 'aMMP8' ? null : usable ? Number((v + drift * 0.4).toFixed(dp)) : null,
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
