/**
 * Converts measurements into colored regions on the point cloud.
 *
 * Each region is drawn only over the footprint its transmitters actually
 * sample (radius from the site config). Beyond ~1.7× footprint the colour
 * fades out entirely — unmeasured areas stay neutral and are never
 * interpolated. A dotted ring marks the edge of each measured area, and
 * withheld readings render slate-grey with the same ring so "unmeasured" is
 * never confused with "healthy". Healthy readings are not coloured at all.
 */
import { siteAnchor, Vec3 } from '../domain/arch';
import { analyzeScan, readingStatus } from '../domain/analysis';
import { Status } from '../domain/biomarkers';
import type { Scan, Strip } from '../domain/types';
import { colors } from '../theme/tokens';
import type { PointCloud } from './retainerGeometry';

export interface Region {
  id: string;
  tooth: number;
  anchor: Vec3; // model space (un-centred)
  normal: Vec3;
  radius: number;
  color: string;
  /** 0–1 — how strongly the colour replaces the neutral dots. */
  intensity: number;
  outline: boolean;
  /** Interproximal regions may wrap round both neighbouring crowns. */
  wrap?: boolean;
}

export const STATUS_HEX: Record<Status, string> = {
  normal: colors.normal,
  mild: colors.mild,
  elevated: colors.elevated,
  high: colors.high,
  unavailable: colors.unavailable,
};

export type ViewMode = 'overview' | 'pH' | 'lactate' | 'calcium' | 'phosphate' | 'fluoride' | 'ammonium' | 'signal';

/** Severity → how strongly the biomarker colour replaces the white dots. */
export const SEVERITY_INTENSITY: Record<Exclude<Status, 'normal' | 'unavailable'>, number> = {
  mild: 0.85,
  elevated: 0.9,
  high: 1,
};

/**
 * Only readings of concern are coloured: amber for borderline, red for
 * needs-attention. Healthy sites stay plain white dots. Withheld
 * readings get a faint slate ring so "not measured" is never read as healthy.
 */
export function regionsForScan(scan: Scan | undefined, strip: Strip | undefined, mode: ViewMode): Region[] {
  if (!scan || !strip) return [];
  if (mode === 'signal') return signalRegions(scan, strip);
  if (mode !== 'overview' && !strip.supported.includes(mode)) return [];
  const a = analyzeScan(scan, strip, []);
  const out: Region[] = [];
  for (const r of a.results) {
    if (mode !== 'overview' && r.site.biomarker !== mode) continue;
    const status = readingStatus(r.reading);
    if (status === 'normal') continue;
    const { p, n } = siteAnchor(r.site.toothUniversal, r.site.surface, r.site.offset);
    out.push({
      id: r.site.id,
      tooth: r.site.toothUniversal,
      anchor: p,
      normal: n,
      radius: r.site.footprintMm,
      color: STATUS_HEX[status],
      intensity: status === 'unavailable' ? 0.55 : SEVERITY_INTENSITY[status],
      outline: true,
      wrap: r.site.surface === 'mesial' || r.site.surface === 'distal',
    });
  }
  return out;
}

/** Strip-health view: local optical transmission per site + reference spots. */
export function signalRegions(scan: Scan, strip: Strip): Region[] {
  // Clear (≥80% transmission) areas stay white; only film build-up is coloured.
  const tColor = (t: number, usable: boolean) => (!usable ? colors.high : colors.mild);
  const out: Region[] = [];
  for (const s of strip.sites) {
    const r = scan.readings.find((x) => x.siteId === s.id)!;
    if (r.value != null && r.transmission >= 0.8) continue;
    const { p, n } = siteAnchor(s.toothUniversal, s.surface, s.offset);
    out.push({
      id: s.id,
      tooth: s.toothUniversal,
      anchor: p,
      normal: n,
      radius: s.footprintMm,
      color: tColor(r.transmission, r.value != null),
      intensity: 0.95,
      outline: true,
      wrap: s.surface === 'mesial' || s.surface === 'distal',
    });
  }
  for (const spot of strip.referenceSpots) {
    const ref = scan.references.find((x) => x.spotId === spot.id);
    if (ref && ref.transmission >= 0.8) continue;
    const { p, n } = siteAnchor(spot.toothUniversal, spot.surface);
    out.push({
      id: spot.id,
      tooth: spot.toothUniversal,
      anchor: p,
      normal: n,
      radius: 1.3,
      color: ref ? tColor(ref.transmission, true) : colors.unavailable,
      intensity: 0.9,
      outline: true,
    });
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Fill per-point colour (rgb), region index and outline flag.
 * `offset` is the centring offset applied to the cloud.
 */
export function paintCloud(
  cloud: PointCloud,
  regions: Region[],
  out: { color: Float32Array; region: Float32Array; outline: Float32Array },
) {
  const base = hexToRgb(colors.point);
  const rgbs = regions.map((r) => hexToRgb(r.color));
  const anchors = regions.map((r) => [r.anchor[0] + cloud.offset[0], r.anchor[1] + cloud.offset[1], r.anchor[2] + cloud.offset[2]]);
  const P = cloud.positions;
  const Nn = cloud.normals;
  for (let i = 0; i < cloud.count; i++) {
    const x = P[i * 3];
    const y = P[i * 3 + 1];
    const z = P[i * 3 + 2];
    let cr = base[0];
    let cg = base[1];
    let cb = base[2];
    let best = 0;
    let bestIdx = -1;
    let ring = 0;
    let ringIdx = -1;
    for (let k = 0; k < regions.length; k++) {
      const a = anchors[k];
      const dx = x - a[0];
      const dy = y - a[1];
      const dz = z - a[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const R = regions[k].radius;
      if (d > R * 2.1) continue;
      const rn = regions[k].normal;
      const facing = Nn[i * 3] * rn[0] + Nn[i * 3 + 1] * rn[1] + Nn[i * 3 + 2] * rn[2];
      if (!regions[k].wrap && facing < -0.25) continue;
      // Measured footprint: full colour inside R, soft fall-off to zero by 1.7R.
      const w = smooth(R * 1.7, R * 0.55, d) * regions[k].intensity;
      if (w > best) {
        best = w;
        bestIdx = k;
      }
      // Dotted boundary ring at the edge of the measured area.
      if (regions[k].outline && d > R * 1.75 && d < R * 2.05) {
        ring = 1;
        ringIdx = k;
      }
    }
    if (bestIdx >= 0) {
      const c = rgbs[bestIdx];
      cr = cr + (c[0] - cr) * best;
      cg = cg + (c[1] - cg) * best;
      cb = cb + (c[2] - cb) * best;
    } else if (ring && ringIdx >= 0) {
      const c = rgbs[ringIdx];
      cr = cr + (c[0] - cr) * 0.4;
      cg = cg + (c[1] - cg) * 0.4;
      cb = cb + (c[2] - cb) * 0.4;
    }
    out.color[i * 3] = cr;
    out.color[i * 3 + 1] = cg;
    out.color[i * 3 + 2] = cb;
    out.region[i] = best > 0.08 ? bestIdx : -1;
    out.outline[i] = ring && bestIdx < 0 && cloud.rand[i] > 0.4 ? 1 : 0;
  }
}
