/**
 * Strip-health analytics: biofouling sensing and time-to-replace.
 *
 * Three independent signals, each with its own configurable limit:
 *   1. Optical clarity — mean transmission of the inert reference spots.
 *      These carry no chemistry, so when they dim it is film on the strip,
 *      not a change in the mouth.
 *   2. Local signal loss — per-site transmission and SNR; sites under the
 *      SNR floor are withheld from results.
 *   3. Use period — days since install and number of sessions.
 *
 * The replacement forecast fits log(clarity) against exposure hours over the
 * strip's recent scans (exponential attenuation is linear in log space) and
 * projects when clarity crosses the replacement limit.
 */
import type { Scan, Strip, StripLimits } from './types';

export type StripState = 'baseline' | 'good' | 'monitor' | 'soon' | 'now';

export interface ClarityPoint {
  at: string;
  exposureHours: number;
  clarity: number;
  perSpot: Record<string, number>;
  usableFraction: number;
  sessionIndex: number;
}

export interface SiteSignal {
  siteId: string;
  transmission: number;
  snr: number;
  usable: boolean;
  /** Site transmission relative to the mean reference spot (<1 = more local film than average). */
  relative: number;
}

export interface Forecast {
  /** Fitted attenuation rate (per exposure hour). */
  rate: number;
  hoursRemaining: number;
  sessionsRemaining: number;
  daysRemaining: number;
  date: Date;
  /** Points used for the fit and R². */
  n: number;
  r2: number;
  /** Projected clarity curve for charting. */
  projection: { exposureHours: number; clarity: number }[];
}

export type Constraint = 'clarity' | 'signal' | 'days' | 'sessions' | null;

export interface StripHealth {
  strip: Strip;
  scans: Scan[];
  state: StripState;
  headline: string;
  detail: string;
  constraint: Constraint;
  clarity: number | null;
  clarityHistory: ClarityPoint[];
  daysInUse: number;
  sessions: number;
  exposureHours: number;
  usableFraction: number | null;
  siteSignals: SiteSignal[];
  lowSignalSites: string[];
  forecast: Forecast | null;
  /** Typical extra uncertainty caused by fouling at the latest scan (pH units). */
  addedUncertainty: number | null;
  hoursPerSession: number;
  limits: StripLimits;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function clarityOf(scan: Scan): number {
  return mean(scan.references.map((r) => r.transmission));
}

export function usableFractionOf(scan: Scan): number {
  const measured = scan.readings;
  return measured.length ? measured.filter((r) => r.value != null).length / measured.length : 0;
}

function fit(points: ClarityPoint[]) {
  // log(clarity) = −k·h  (through the origin: clarity is 1 at baseline)
  const pts = points.filter((p) => p.exposureHours > 0 && p.clarity > 0);
  if (pts.length < 3) return null;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) {
    sxy += p.exposureHours * Math.log(p.clarity);
    sxx += p.exposureHours * p.exposureHours;
  }
  const k = -sxy / sxx;
  const ys = pts.map((p) => Math.log(p.clarity));
  const my = mean(ys);
  let ssTot = 0;
  let ssRes = 0;
  pts.forEach((p, i) => {
    ssTot += (ys[i] - my) ** 2;
    ssRes += (ys[i] + k * p.exposureHours) ** 2;
  });
  return { k, r2: ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1, n: pts.length };
}

export function computeStripHealth(
  strip: Strip,
  allScans: Scan[],
  limits: StripLimits,
  now = new Date(),
): StripHealth {
  const scans = allScans
    .filter((s) => s.stripId === strip.id)
    .sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const daysInUse = Math.max(0, (now.getTime() - new Date(strip.installedAt).getTime()) / 86400000);
  const latest = scans[scans.length - 1];

  const base: Omit<StripHealth, 'state' | 'headline' | 'detail' | 'constraint'> = {
    strip,
    scans,
    clarity: null,
    clarityHistory: [],
    daysInUse,
    sessions: scans.length,
    exposureHours: latest?.exposureHours ?? 0,
    usableFraction: null,
    siteSignals: [],
    lowSignalSites: [],
    forecast: null,
    addedUncertainty: null,
    hoursPerSession: 9,
    limits,
  };

  if (!latest) {
    return {
      ...base,
      state: 'baseline',
      constraint: null,
      headline: 'Baseline pending',
      detail: 'Run your first scan with this strip. It records the optical baseline every later reading is compared with.',
    };
  }

  const clarityHistory: ClarityPoint[] = scans.map((s) => ({
    at: s.at,
    exposureHours: s.exposureHours,
    clarity: clarityOf(s),
    perSpot: Object.fromEntries(s.references.map((r) => [r.spotId, r.transmission])),
    usableFraction: usableFractionOf(s),
    sessionIndex: s.sessionIndex,
  }));
  const clarity = clarityOf(latest);
  const usableFraction = usableFractionOf(latest);
  const siteSignals: SiteSignal[] = latest.readings.map((r) => ({
    siteId: r.siteId,
    transmission: r.transmission,
    snr: r.snr,
    usable: r.value != null,
    relative: clarity > 0 ? r.transmission / clarity : 1,
  }));
  const lowSignalSites = siteSignals.filter((s) => !s.usable).map((s) => s.siteId);

  // Hours of exposure gained per session (for converting the forecast into sessions/days).
  // Median exposure gained between sessions (robust to quick re-scans), and exposure per calendar day.
  const incs = scans.slice(1).map((s, i) => s.exposureHours - scans[i].exposureHours).filter((x) => x > 0).sort((a, b) => a - b);
  const hoursPerSession = incs.length ? Math.max(0.5, incs[Math.floor(incs.length / 2)]) : 9;
  const spanH = latest.exposureHours - scans[0].exposureHours;
  const spanDays = (new Date(latest.at).getTime() - new Date(scans[0].at).getTime()) / 86400000;
  const hoursPerDay = spanDays > 0.5 && spanH > 0 ? spanH / spanDays : 9;

  let forecast: Forecast | null = null;
  const f = fit(clarityHistory.slice(-8));
  if (f && f.k > 0) {
    const hTarget = -Math.log(limits.clarityReplace) / f.k;
    const hoursRemaining = Math.max(0, hTarget - latest.exposureHours);
    const sessionsRemaining = hoursRemaining / hoursPerSession;
    const daysRemaining = hoursRemaining / Math.max(0.5, hoursPerDay);
    const projection: Forecast['projection'] = [];
    const h0 = latest.exposureHours;
    const h1 = Math.max(h0 + 1, hTarget + hoursPerSession);
    for (let i = 0; i <= 12; i++) {
      const h = h0 + ((h1 - h0) * i) / 12;
      projection.push({ exposureHours: h, clarity: Math.exp(-f.k * h) });
    }
    forecast = {
      rate: f.k,
      hoursRemaining,
      sessionsRemaining,
      daysRemaining,
      date: new Date(new Date(latest.at).getTime() + daysRemaining * 86400000),
      n: f.n,
      r2: f.r2,
      projection,
    };
  }

  const usable = latest.readings.filter((r) => r.value != null);
  const addedUncertainty = usable.length
    ? mean(usable.map((r) => r.uncertainty)) - (0.04 + 0.6 / 31)
    : null;

  // ── Decide state, most severe first ──
  let state: StripState = 'good';
  let constraint: Constraint = null;
  let headline = 'Strip performing well';
  let detail = 'Reference spots are clear and every site is above the signal-quality floor.';

  const daysLeft = limits.maxDays - daysInUse;
  const sessionsLeft = limits.maxSessions - scans.length;

  if (clarity < limits.clarityReplace) {
    state = 'now'; constraint = 'clarity';
    headline = 'Replace your strip';
    detail = `Optical clarity is ${pct(clarity)}, below the ${pct(limits.clarityReplace)} limit. Film on the strip now limits how reliably it can be read.`;
  } else if (usableFraction < limits.usableMin - 0.25) {
    state = 'now'; constraint = 'signal';
    headline = 'Replace your strip';
    detail = `Only ${pct(usableFraction)} of sites returned a usable signal.`;
  } else if (daysLeft <= 0) {
    state = 'now'; constraint = 'days';
    headline = 'Use period complete';
    detail = `This strip has reached its ${limits.maxDays}-day validated use period.`;
  } else if (sessionsLeft <= 0) {
    state = 'now'; constraint = 'sessions';
    headline = 'Session limit reached';
    detail = `This strip has completed its ${limits.maxSessions} validated sessions.`;
  } else if (
    clarity < limits.claritySoon ||
    (forecast && forecast.sessionsRemaining <= 3) ||
    usableFraction < limits.usableMin
  ) {
    state = 'soon';
    constraint = usableFraction < limits.usableMin && clarity >= limits.claritySoon ? 'signal' : 'clarity';
    headline = 'Replace soon';
    detail =
      constraint === 'signal'
        ? `${lowSignalSites.length} site${lowSignalSites.length === 1 ? '' : 's'} fell below the signal floor from local film build-up, though the strip is otherwise clear.`
        : forecast
          ? `Clarity is ${pct(clarity)} and falling about ${pct(1 - Math.exp(-forecast.rate * hoursPerSession), 1)} per session. At this rate it reaches the ${pct(limits.clarityReplace)} limit in about ${Math.max(1, Math.round(forecast.sessionsRemaining))} session${Math.round(forecast.sessionsRemaining) === 1 ? '' : 's'}.`
          : `Clarity is ${pct(clarity)}, approaching the ${pct(limits.clarityReplace)} limit.`;
  } else if (daysLeft <= 2 || sessionsLeft <= 2) {
    state = 'soon';
    constraint = daysLeft <= 2 ? 'days' : 'sessions';
    headline = 'Replace soon';
    detail = daysLeft <= 2 ? `${Math.ceil(daysLeft)} day${Math.ceil(daysLeft) === 1 ? '' : 's'} left in the validated use period.` : `${sessionsLeft} sessions left on this strip.`;
  } else if (clarity < 0.85 || lowSignalSites.length > 0) {
    state = 'monitor';
    constraint = 'clarity';
    headline = 'Strip ageing normally';
    detail = 'Some film has built up, as expected. Readings are being compensated and remain within quality limits.';
  }

  return {
    ...base,
    clarity,
    clarityHistory,
    usableFraction,
    siteSignals,
    lowSignalSites,
    forecast,
    addedUncertainty,
    hoursPerSession,
    state,
    constraint,
    headline,
    detail,
  };
}

export function pct(x: number, digits = 0) {
  return `${(x * 100).toFixed(digits)}%`;
}

export const STATE_COLOR_KEY: Record<StripState, 'normal' | 'mild' | 'elevated' | 'high' | 'unavailable'> = {
  baseline: 'unavailable',
  good: 'normal',
  monitor: 'normal',
  soon: 'mild',
  now: 'high',
};
