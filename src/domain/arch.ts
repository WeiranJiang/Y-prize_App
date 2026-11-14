/**
 * Anatomical upper-arch geometry, in millimetres.
 *
 * Coordinate frame (model space):
 *   x — patient's left is +x, patient's right is −x (matches dental charts,
 *       where the patient's right appears on the viewer's left).
 *   y — occlusal direction is +y (the retainer is shown cusps-up, as it
 *       sits in the scanning tray).
 *   z — anterior is +z.
 *
 * Pure math: shared by the 3D renderer and the research coordinate readout.
 */
import { RETAINER_TEETH, Tooth, toothByUniversal } from './teeth';

export type Vec3 = [number, number, number];

/** Mesiodistal crown width, buccolingual thickness and crown height (mm), by position 1–8. */
export const CROWN = [
  null,
  { w: 8.6, b: 7.0, h: 9.6 }, // central incisor
  { w: 6.6, b: 6.2, h: 8.4 }, // lateral incisor
  { w: 7.6, b: 8.0, h: 9.4 }, // canine
  { w: 7.0, b: 9.2, h: 8.2 }, // first premolar
  { w: 6.7, b: 9.0, h: 7.8 }, // second premolar
  { w: 10.2, b: 11.2, h: 7.2 }, // first molar
  { w: 9.2, b: 11.0, h: 6.8 }, // second molar
  { w: 8.6, b: 10.4, h: 6.4 }, // third molar
] as const;

const GAP = 0.35; // interproximal contact spacing (mm)

// Arch centreline: a blended parabola that widens posteriorly.
const DEPTH = 30;
const HALF_WIDTH = 27.5;
function curveZ(x: number) {
  const r = Math.abs(x) / HALF_WIDTH;
  return DEPTH * (1 - Math.pow(r, 1.7)) - 12;
}

// Pre-computed arc-length table along x ≥ 0.
const TABLE: { x: number; s: number }[] = (() => {
  const out: { x: number; s: number }[] = [{ x: 0, s: 0 }];
  let s = 0;
  const dx = 0.02;
  for (let x = dx; x <= 40; x += dx) {
    const dz = curveZ(x) - curveZ(x - dx);
    s += Math.hypot(dx, dz);
    out.push({ x, s });
  }
  return out;
})();

function xAtArc(s: number) {
  let lo = 0;
  let hi = TABLE.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (TABLE[mid].s < s) lo = mid;
    else hi = mid;
  }
  const a = TABLE[lo];
  const b = TABLE[hi];
  const t = (s - a.s) / Math.max(1e-6, b.s - a.s);
  return a.x + (b.x - a.x) * t;
}

export interface ToothFrame {
  tooth: Tooth;
  center: Vec3; // crown base centre on the arch line (cervical level, y = 0)
  tangent: Vec3; // unit vector pointing mesial→distal along the arch
  normal: Vec3; // unit vector pointing buccal/labial (outward)
  w: number;
  b: number;
  h: number;
}

function frameAt(arcS: number, sideSign: 1 | -1) {
  const x = xAtArc(arcS);
  const z = curveZ(x);
  const x2 = xAtArc(arcS + 0.05);
  const z2 = curveZ(x2);
  let tx = x2 - x;
  let tz = z2 - z;
  const len = Math.hypot(tx, tz) || 1;
  tx /= len;
  tz /= len;
  const t: Vec3 = [sideSign * tx, 0, tz]; // distal direction
  // Perpendicular in the occlusal plane; orientation is fixed up by the caller.
  return {
    center: [sideSign * x, 0, z] as Vec3,
    tangent: t,
    normal: [t[2], 0, -t[0]] as Vec3,
  };
}

let FRAMES: Map<number, ToothFrame> | null = null;

export function toothFrames(): Map<number, ToothFrame> {
  if (FRAMES) return FRAMES;
  const map = new Map<number, ToothFrame>();
  for (const side of ['right', 'left'] as const) {
    const sign: 1 | -1 = side === 'left' ? 1 : -1;
    let s = GAP / 2;
    for (let pos = 1; pos <= 8; pos++) {
      const c = CROWN[pos]!;
      const mid = s + c.w / 2;
      s += c.w + GAP;
      const tooth = RETAINER_TEETH.find((t) => t.side === side && t.position === pos) ??
        toothByUniversal(side === 'right' ? 9 - pos : 8 + pos);
      const f = frameAt(mid, sign);
      // Make sure the normal points outward (away from the arch centroid at z≈0,x=0 interior).
      const inward: Vec3 = [-f.center[0], 0, -(f.center[2] - 2)];
      if (f.normal[0] * inward[0] + f.normal[2] * inward[2] > 0) {
        f.normal = [-f.normal[0], 0, -f.normal[2]];
      }
      map.set(tooth.universal, { tooth, ...f, w: c.w, b: c.b, h: c.h });
    }
  }
  FRAMES = map;
  return map;
}

export function frameFor(universal: number): ToothFrame | undefined {
  return toothFrames().get(universal);
}

/** Convert a tooth-local coordinate (t along distal, n buccal, y occlusal) to model space. */
export function localToModel(f: ToothFrame, t: number, n: number, y: number): Vec3 {
  return [
    f.center[0] + f.tangent[0] * t + f.normal[0] * n,
    y,
    f.center[2] + f.tangent[2] * t + f.normal[2] * n,
  ];
}

export type SurfaceId = 'mesial' | 'distal' | 'buccal' | 'lingual' | 'gingival' | 'occlusal';

export const SURFACE_LABEL: Record<SurfaceId, string> = {
  mesial: 'Mesial',
  distal: 'Distal',
  buccal: 'Buccal',
  lingual: 'Lingual',
  gingival: 'Gingival margin',
  occlusal: 'Occlusal',
};

/** Anchor point of a sensing site on the retainer shell, plus outward normal. */
export function siteAnchor(universal: number, surface: SurfaceId): { p: Vec3; n: Vec3 } {
  const f = frameFor(universal);
  if (!f) return { p: [0, 0, 0], n: [0, 1, 0] };
  const shell = 0.7;
  switch (surface) {
    case 'mesial':
      return {
        p: localToModel(f, -(f.w / 2 + GAP / 2), f.b * 0.3 + shell, f.h * 0.42),
        n: f.normal,
      };
    case 'distal':
      return {
        p: localToModel(f, f.w / 2 + GAP / 2, f.b * 0.3 + shell, f.h * 0.42),
        n: f.normal,
      };
    case 'buccal':
      return { p: localToModel(f, 0, f.b / 2 + shell, f.h * 0.55), n: f.normal };
    case 'gingival':
      return { p: localToModel(f, 0, f.b / 2 + shell, f.h * 0.1), n: f.normal };
    case 'lingual':
      return {
        p: localToModel(f, 0, -(f.b / 2 + shell), f.h * 0.5),
        n: [-f.normal[0], 0, -f.normal[2]],
      };
    case 'occlusal':
      return { p: localToModel(f, 0, 0, f.h + shell), n: [0, 1, 0] };
  }
}

export const ARCH_CENTER: Vec3 = [0, 4, -3];
