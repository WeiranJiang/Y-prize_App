/**
 * Whole-mouth summary for the Overview tab: for each scan session, the share
 * of usable readings that are in range — overall, per arch and per biomarker —
 * plus a simple direction-of-travel and consistency label.
 *
 * "Share in range" is a plain count, not a validated health score.
 */
import { siteSeries } from './analysis';
import { BIOMARKER_ORDER, BiomarkerId, classify, BIOMARKERS } from './biomarkers';
import type { Arch } from './teeth';
import type { Scan, Strip } from './types';

export type Direction = 'improving' | 'steady' | 'worsening';

export interface SessionPoint {
  at: string;
  overall: number | null;
  byArch: Record<Arch, number | null>;
  byBiomarker: Record<BiomarkerId, number | null>;
}

export interface BiomarkerSummary {
  id: BiomarkerId;
  inRange: number | null;
  sites: number;
  concerns: number;
  direction: Direction;
  consistent: boolean;
  history: (number | null)[];
  /** Signed, range-normalised trend per day (positive = away from concern). */
  score: number;
}

export interface Overview {
  sessions: SessionPoint[];
  overall: number | null;
  direction: Direction;
  delta: number | null;
  byArch: Record<Arch, number | null>;
  biomarkers: BiomarkerSummary[];
  sites: number;
}

const share = (ok: number, n: number) => (n ? ok / n : null);
const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function direction(history: (number | null)[]): { dir: Direction; delta: number | null } {
  const recent = mean(history.slice(-3));
  const before = mean(history.slice(-8, -3));
  if (recent == null || before == null) return { dir: 'steady', delta: null };
  const d = recent - before;
  return { dir: d > 0.04 ? 'improving' : d < -0.04 ? 'worsening' : 'steady', delta: d };
}

export function buildOverview(scans: Scan[], strips: Strip[], days = 30): Overview {
  const cutoff = Date.now() - days * 86400000;
  const archOf = new Map(strips.map((s) => [s.id, s.arch] as const));
  // A session = scans read in the same minute (the case reads both retainers together).
  const groups = new Map<string, Scan[]>();
  for (const s of scans) {
    if (+new Date(s.at) < cutoff) continue;
    const key = s.at.slice(0, 16);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const sessions: SessionPoint[] = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, ss]) => {
      const tally = { all: [0, 0], upper: [0, 0], lower: [0, 0] } as Record<string, [number, number]>;
      const bm = Object.fromEntries(BIOMARKER_ORDER.map((b) => [b, [0, 0]])) as Record<BiomarkerId, [number, number]>;
      for (const s of ss) {
        const arch = archOf.get(s.stripId) ?? 'upper';
        for (const r of s.readings) {
          if (r.value == null) continue;
          const ok = classify(r.value, BIOMARKERS[r.biomarker].bands) === 'normal' ? 1 : 0;
          tally.all[0] += ok; tally.all[1]++;
          tally[arch][0] += ok; tally[arch][1]++;
          bm[r.biomarker][0] += ok; bm[r.biomarker][1]++;
        }
      }
      return {
        at: ss[0].at,
        overall: share(...tally.all),
        byArch: { upper: share(...tally.upper), lower: share(...tally.lower) },
        byBiomarker: Object.fromEntries(BIOMARKER_ORDER.map((b) => [b, share(...bm[b])])) as Record<BiomarkerId, number | null>,
      };
    });

  const latest = sessions[sessions.length - 1];
  const overallHist = sessions.map((s) => s.overall);
  const o = direction(overallHist);
  const current = strips.filter((s) => !s.retiredAt);
  const latestScans = current.map((st) => scans.filter((s) => s.stripId === st.id).sort((a, b) => +new Date(a.at) - +new Date(b.at)).pop()).filter(Boolean) as Scan[];

  // Direction of travel: per-site value slope over the window (per day), scaled to the biomarker's
  // range and signed so that positive = moving away from concern; averaged across that biomarker's sites.
  const windowScans = scans.filter((s) => +new Date(s.at) >= cutoff);
  const scoreOf = (id: BiomarkerId) => {
    const b = BIOMARKERS[id];
    const span = b.range[1] - b.range[0];
    const slopes: number[] = [];
    for (const st of current) {
      for (const site of st.sites.filter((x) => x.biomarker === id)) {
        const pts = siteSeries(site.id, windowScans, id).filter((p) => p.value != null).map((p) => ({ t: +new Date(p.at) / 86400000, v: p.value as number }));
        if (pts.length < 3) continue;
        const mt = pts.reduce((a, p) => a + p.t, 0) / pts.length;
        const mv = pts.reduce((a, p) => a + p.v, 0) / pts.length;
        const num = pts.reduce((a, p) => a + (p.t - mt) * (p.v - mv), 0);
        const den = pts.reduce((a, p) => a + (p.t - mt) ** 2, 0) || 1;
        slopes.push(((num / den) / span) * (b.bands.concern === 'low' ? 1 : -1));
      }
    }
    if (!slopes.length) return 0;
    const avg = slopes.reduce((a, x) => a + x, 0) / slopes.length;
    // One site declining sharply should not be averaged away.
    return Math.min(...slopes) < -0.008 ? Math.min(avg, -0.002) : avg;
  };
  const toDir = (score: number): Direction => (score > 0.0015 ? 'improving' : score < -0.0015 ? 'worsening' : 'steady');

  const biomarkers: BiomarkerSummary[] = BIOMARKER_ORDER.map((id) => {
    const history = sessions.map((s) => s.byBiomarker[id]);
    const score = scoreOf(id);
    const readings = latestScans.flatMap((s) => s.readings.filter((r) => r.biomarker === id));
    const concerns = readings.filter((r) => {
      const st = classify(r.value, BIOMARKERS[id].bands);
      return st === 'elevated' || st === 'high';
    }).length;
    const usable = readings.filter((r) => r.value != null && BIOMARKERS[id].bands.configured !== false);
    const inRange = usable.length ? usable.filter((r) => classify(r.value, BIOMARKERS[id].bands) === 'normal').length / usable.length : null;
    return { id, inRange, sites: readings.length, concerns, direction: toDir(score), consistent: usable.length > 0 && concerns === 0 && toDir(score) === 'steady', history, score };
  });
  const assessed = biomarkers.filter(b => BIOMARKERS[b.id].bands.configured !== false && b.inRange != null);
  const meanScore = assessed.reduce((a, b) => a + b.score, 0) / Math.max(1, assessed.length);
  void o;

  return {
    sessions,
    overall: latest?.overall ?? null,
    direction: biomarkers.filter((b) => b.direction === 'worsening').length >= 2 ? 'worsening' : toDir(meanScore),
    delta: o.delta,
    byArch: latest?.byArch ?? { upper: null, lower: null },
    biomarkers,
    sites: latestScans.reduce((n, s) => n + s.readings.length, 0),
  };
}

export interface BiomarkerStat {
  id: BiomarkerId;
  /** Median of the latest usable readings across the chosen sites. */
  median: number | null;
  status: import('./biomarkers').Status;
  sites: number;
  attention: number;
  borderline: number;
  at: string | null;
  /** Median per scan session, oldest first. */
  series: { at: string; value: number | null }[];
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Summary of one biomarker across the current strips (optionally one arch):
 * median of the latest readings plus counts by status. The median is a
 * convenience summary — site-level values stay the primary data.
 */
export function biomarkerStat(id: BiomarkerId, scans: Scan[], strips: Strip[], days = 30, arch?: Arch): BiomarkerStat {
  const b = BIOMARKERS[id];
  const pool = strips.filter((s) => !arch || s.arch === arch);
  const ids = new Set(pool.map((s) => s.id));
  const current = pool.filter((s) => !s.retiredAt);
  const latest = current
    .map((st) => scans.filter((s) => s.stripId === st.id).sort((a, z) => +new Date(a.at) - +new Date(z.at)).pop())
    .filter(Boolean) as Scan[];
  const readings = latest.flatMap((s) => s.readings.filter((r) => r.biomarker === id));
  const vals = readings.map((r) => r.value).filter((v): v is number => v != null);
  const statuses = readings.map((r) => classify(r.value, b.bands));
  const med = median(vals);
  const cutoff = Date.now() - days * 86400000;
  const groups = new Map<string, number[]>();
  const times = new Map<string, string>();
  for (const s of scans) {
    if (!ids.has(s.stripId) || +new Date(s.at) < cutoff) continue;
    const key = s.at.slice(0, 16);
    times.set(key, s.at);
    const v = s.readings.filter((r) => r.biomarker === id && r.value != null).map((r) => r.value as number);
    groups.set(key, [...(groups.get(key) ?? []), ...v]);
  }
  const series = [...groups.entries()].sort((a, z) => (a[0] < z[0] ? -1 : 1)).map(([k, v]) => ({ at: times.get(k)!, value: median(v) }));
  const attention = statuses.filter((s) => s === 'elevated' || s === 'high').length;
  const borderline = statuses.filter((s) => s === 'mild').length;
  return {
    id,
    median: med,
    status: attention ? 'high' : borderline ? 'mild' : vals.length ? 'normal' : 'unavailable',
    sites: readings.length,
    attention,
    borderline,
    at: latest.map((s) => s.at).sort().pop() ?? null,
    series,
  };
}
