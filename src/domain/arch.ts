/**
 * Anatomical arch geometry (upper and lower), in millimetres.
 *
 * Coordinate frame (model space, per arch):
 *   x — patient's left is +x, patient's right is −x (matches dental charts,
 *       where the patient's right appears on the viewer's left).
 *   y — occlusal direction is +y (each retainer is shown cusps-up, as it
 *       sits in the scanning tray).
 *   z — anterior is +z.
 *
 * Pure math: shared by the 3D renderer and the research coordinate readout.
 */
import { Arch, Tooth, toothByUniversal } from './teeth';

export type Vec3 = [number, number, number];

type Crown = { w: number; b: number; h: number };
/** Mesiodistal crown width, buccolingual thickness and crown height (mm), by position 1–8. */
export const CROWNS: Record<Arch, (Crown | null)[]> = {
  upper: [
    null,
    { w: 8.6, b: 7.0, h: 9.6 }, // central incisor
    { w: 6.6, b: 6.2, h: 8.4 }, // lateral incisor
    { w: 7.6, b: 8.0, h: 9.4 }, // canine
    { w: 7.0, b: 9.2, h: 8.2 }, // first premolar
    { w: 6.7, b: 9.0, h: 7.8 }, // second premolar
    { w: 10.2, b: 11.2, h: 7.2 }, // first molar
    { w: 9.2, b: 11.0, h: 6.8 }, // second molar
    { w: 8.6, b: 10.4, h: 6.4 }, // third molar
  ],
  lower: [
    null,
    { w: 5.4, b: 6.0, h: 8.8 },
    { w: 5.9, b: 6.4, h: 9.0 },
    { w: 7.0, b: 7.6, h: 9.8 },
    { w: 7.0, b: 7.8, h: 8.2 },
    { w: 7.1, b: 8.2, h: 7.8 },
    { w: 11.0, b: 10.4, h: 7.3 },
    { w: 10.4, b: 10.0, h: 6.9 },
    { w: 10.0, b: 9.6, h: 6.6 },
  ],
};
/** Back-compat: upper crowns. */
export const CROWN = CROWNS.upper;
export const crownFor = (arch: Arch, pos: number) => CROWNS[arch][pos]!;

const GAP = 0.35; // interproximal contact spacing (mm)

// Arch centreline: a blended parabola that widens posteriorly. The lower arch is a little narrower.
const CURVE: Record<Arch, { depth: number; half: number; exp: number; off: number }> = {
  upper: { depth: 30, half: 27.5, exp: 1.7, off: -12 },
  lower: { depth: 27, half: 25.5, exp: 1.75, off: -11 },
};

function makeArc(arch: Arch) {
  const c = CURVE[arch];
  const curveZ = (x: number) => c.depth * (1 - Math.pow(Math.abs(x) / c.half, c.exp)) + c.off;
  const table: { x: number; s: number }[] = [{ x: 0, s: 0 }];
  let s = 0;
  const dx = 0.02;
  for (let x = dx; x <= 45; x += dx) {
    const dz = curveZ(x) - curveZ(x - dx);
    s += Math.hypot(dx, dz);
    table.push({ x, s });
  }
  const xAtArc = (arc: number) => {
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid].s < arc) lo = mid;
      else hi = mid;
    }
    const a = table[lo];
    const b = table[hi];
    const t = (arc - a.s) / Math.max(1e-6, b.s - a.s);
    return a.x + (b.x - a.x) * t;
  };
  return { curveZ, xAtArc, apexZ: c.depth + c.off };
}

export interface ToothFrame {
  tooth: Tooth;
  arch: Arch;
  center: Vec3; // crown base centre on the arch line (cervical level, y = 0)
  tangent: Vec3; // unit vector pointing mesial→distal along the arch
  normal: Vec3; // unit vector pointing buccal/labial (outward)
  w: number;
  b: number;
  h: number;
}

function universalFor(arch: Arch, side: 'right' | 'left', pos: number) {
  if (arch === 'upper') return side === 'right' ? 9 - pos : 8 + pos;
  return side === 'left' ? 25 - pos : 24 + pos;
}

let FRAMES: Map<number, ToothFrame> | null = null;

/** Frames for all 32 teeth, keyed by Universal number. */
export function toothFrames(): Map<number, ToothFrame> {
  if (FRAMES) return FRAMES;
  const map = new Map<number, ToothFrame>();
  for (const arch of ['upper', 'lower'] as const) {
    const arc = makeArc(arch);
    for (const side of ['right', 'left'] as const) {
      const sign: 1 | -1 = side === 'left' ? 1 : -1;
      let s = GAP / 2;
      for (let pos = 1; pos <= 8; pos++) {
        const c = crownFor(arch, pos);
        const mid = s + c.w / 2;
        s += c.w + GAP;
        const x = arc.xAtArc(mid);
        const z = arc.curveZ(x);
        const x2 = arc.xAtArc(mid + 0.05);
        const z2 = arc.curveZ(x2);
        const len = Math.hypot(x2 - x, z2 - z) || 1;
        const tangent: Vec3 = [(sign * (x2 - x)) / len, 0, (z2 - z) / len];
        let normal: Vec3 = [tangent[2], 0, -tangent[0]];
        const center: Vec3 = [sign * x, 0, z];
        // Normal must point away from the arch interior.
        const inward: Vec3 = [-center[0], 0, arc.apexZ - 14 - center[2]];
        if (normal[0] * inward[0] + normal[2] * inward[2] > 0) normal = [-normal[0], 0, -normal[2]];
        const tooth = toothByUniversal(universalFor(arch, side, pos));
        map.set(tooth.universal, { tooth, arch, center, tangent, normal, w: c.w, b: c.b, h: c.h });
      }
    }
  }
  FRAMES = map;
  return map;
}

export function archFrames(arch: Arch): ToothFrame[] {
  return [...toothFrames().values()].filter((f) => f.arch === arch);
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

/**
 * Anchor point of a sensing site on the retainer shell, plus outward normal.
 * `offset` = [mm along the arch (distal +), mm in height] lets several
 * biomarker sensors share one surface without overlapping.
 */
export function siteAnchor(universal: number, surface: SurfaceId, offset?: [number, number]): { p: Vec3; n: Vec3 } {
  const base = rawAnchor(universal, surface);
  if (!offset) return base;
  const f = frameFor(universal)!;
  return {
    p: [base.p[0] + f.tangent[0] * offset[0], base.p[1] + offset[1], base.p[2] + f.tangent[2] * offset[0]],
    n: base.n,
  };
}

function rawAnchor(universal: number, surface: SurfaceId): { p: Vec3; n: Vec3 } {
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

export const ARCH_CENTER: Record<Arch, Vec3> = { upper: [0, 4, -3], lower: [0, 4, -3] };
