/**
 * Procedural point-cloud of a clear upper retainer.
 *
 * Each crown is a stack of superellipse cross-sections whose width,
 * thickness and squareness follow the tooth type (thin incisal edges,
 * pointed canines, two-cusp premolars, four-cusp molars). The retainer shell
 * is that surface offset outward by ~0.6 mm, plus a short gingival skirt with
 * a gentle scallop. Points are laid on a near-regular grid with a small
 * jitter, so they read as an evenly sampled precise surface.
 */
import { ARCH_CENTER, archFrames, localToModel, ToothFrame, Vec3 } from '../domain/arch';
import type { Arch } from '../domain/teeth';

export interface PointCloud {
  positions: Float32Array;
  normals: Float32Array;
  tooth: Float32Array;
  rand: Float32Array;
  count: number;
  /** Centroid of each tooth's points (model space, already centred). */
  toothCenters: Map<number, Vec3>;
  offset: Vec3;
}

const SHELL = 0.6;
const SPACING = 0.43;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Kind = 'incisor' | 'canine' | 'premolar' | 'molar';
const kindOf = (pos: number): Kind => (pos <= 2 ? 'incisor' : pos === 3 ? 'canine' : pos <= 5 ? 'premolar' : 'molar');

const EXP: Record<Kind, number> = { incisor: 2.3, canine: 2.2, premolar: 2.45, molar: 2.75 };

function halfWidth(f: ToothFrame, k: Kind, v: number) {
  let a: number;
  if (k === 'incisor') a = (f.w / 2) * (0.8 + 0.2 * Math.sin((Math.PI / 2) * Math.min(1, v * 1.4)));
  else a = (f.w / 2) * (0.8 + 0.2 * Math.sin(Math.PI * (0.12 + 0.72 * v)));
  if (k === 'canine') a *= 1 - 0.45 * Math.pow(v, 2.4);
  return a + SHELL;
}
function halfDepth(f: ToothFrame, k: Kind, v: number) {
  const b0 = f.b / 2;
  let b: number;
  if (k === 'incisor') b = b0 * (1 - 0.7 * Math.pow(v, 1.35));
  else if (k === 'canine') b = b0 * (1 - 0.45 * Math.pow(v, 1.7));
  else b = b0 * (0.84 + 0.16 * Math.sin(Math.PI * (0.15 + 0.7 * v))) * (1 - 0.2 * Math.pow(v, 3));
  return b + SHELL;
}
/** Labial inclination of anterior crowns (mm of outward shift at height v). */
function tilt(k: Kind, v: number) {
  return k === 'incisor' ? 1.3 * v * v : k === 'canine' ? 0.6 * v * v : 0;
}

/** Occlusal relief above crown height, u = t/a, w = n/b in [-1, 1]. */
function relief(k: Kind, u: number, w: number) {
  const g = (cu: number, cw: number, s: number) => Math.exp(-((u - cu) ** 2 + (w - cw) ** 2) / s);
  const r2 = Math.min(1, u * u + w * w);
  switch (k) {
    case 'molar':
      return 1.35 * Math.max(g(-0.42, 0.42, 0.11), g(0.42, 0.45, 0.11), g(-0.4, -0.42, 0.12), g(0.38, -0.4, 0.1)) - 0.55 * (1 - r2);
    case 'premolar':
      return 1.3 * Math.max(g(0, 0.48, 0.13), g(0, -0.45, 0.15)) - 0.5 * (1 - r2);
    case 'canine':
      return 1.1 * g(0, 0, 0.35);
    default:
      return 0.15 * (1 - u * u);
  }
}

function superPoint(a: number, b: number, p: number, phi: number) {
  const c = Math.cos(phi);
  const s = Math.sin(phi);
  const e = 2 / p;
  return [a * Math.sign(c) * Math.pow(Math.abs(c), e), b * Math.sign(s) * Math.pow(Math.abs(s), e)] as const;
}

export function buildRetainerCloud(arch: Arch = 'upper'): PointCloud {
  const P: number[] = [];
  const N: number[] = [];
  const T: number[] = [];
  const R: number[] = [];
  const rand = rng(7);
  const frames = archFrames(arch);
  const centers = new Map<number, Vec3>();

  const push = (p: Vec3, n: Vec3, tooth: number) => {
    P.push(p[0], p[1], p[2]);
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    N.push(n[0] / l, n[1] / l, n[2] / l);
    T.push(tooth);
    R.push(rand());
  };

  for (const f of frames) {
    if (f.tooth.position > 7) continue; // retainer stops at the second molars
    const k = kindOf(f.tooth.position);
    const p = EXP[k];
    const isLast = f.tooth.position === 7;
    const sum: Vec3 = [0, 0, 0];
    let cnt = 0;
    const add = (t: number, n: number, y: number, nt: number, nn: number, ny: number) => {
      const pos = localToModel(f, t, n, y);
      const nrm: Vec3 = [f.tangent[0] * nt + f.normal[0] * nn, ny, f.tangent[2] * nt + f.normal[2] * nn];
      push(pos, nrm, f.tooth.universal);
      sum[0] += pos[0]; sum[1] += pos[1]; sum[2] += pos[2]; cnt++;
    };
    const edgeRelief = (phi: number) => {
      const [u, w] = superPoint(1, 1, p, phi);
      return relief(k, u * 0.98, w * 0.98);
    };

    // ── Axial walls + gingival skirt ──
    const skirt = 2.0;
    const top = f.h + SHELL;
    const total = top + skirt;
    const rows = Math.ceil(total / SPACING);
    for (let i = 0; i < rows; i++) {
      const yy = -skirt + (i / rows) * total; // nominal height
      const v = Math.max(0, Math.min(1, yy / top));
      const flare = yy < 0 ? -yy * 0.22 : 0;
      const a = halfWidth(f, k, Math.min(1, v)) + flare;
      const b = halfDepth(f, k, Math.min(1, v)) + flare;
      const per = 2 * Math.PI * Math.sqrt((a * a + b * b) / 2) * 1.04;
      const cols = Math.max(12, Math.round(per / SPACING));
      for (let j = 0; j < cols; j++) {
        const phi = ((j + (i % 2) * 0.5 + (rand() - 0.5) * 0.5) / cols) * Math.PI * 2;
        const [t, n] = superPoint(a, b, p, phi);
        // Skip the flat interproximal contact faces (the shell bridges the embrasure instead).
        const contact = Math.abs(t) > a * 0.9 && Math.abs(n) < b * 0.3;
        const distalEnd = isLast && t > 0;
        if (contact && !distalEnd && v < 0.92) continue;
        // Scalloped trim line: the skirt is shorter at the papillae than at mid-crown.
        if (yy < 0) {
          const scallop = 0.75 + 0.25 * (1 - Math.pow(Math.abs(t) / a, 2));
          if (-yy > skirt * scallop) continue;
        }
        // Blend toward the occlusal relief over the top 20% so the wall meets the cap.
        const ySurf = yy + (v > 0.8 ? ((v - 0.8) / 0.2) * edgeRelief(phi) : 0);
        const jitter = (rand() - 0.5) * SPACING * 0.55;
        const nt = Math.cos(phi);
        const nn = Math.sin(phi);
        add(t, n + tilt(k, v), ySurf + jitter, nt, nn, v > 0.8 ? 0.4 * (v - 0.8) * 5 : yy < 0 ? -0.25 : 0);
      }
    }

    // ── Occlusal / incisal surface ──
    const a1 = halfWidth(f, k, 1);
    const b1 = halfDepth(f, k, 1);
    const rings = Math.max(2, Math.ceil(Math.max(a1, b1) / SPACING));
    for (let r = rings; r >= 1; r--) {
      const rr = r / rings;
      const per = 2 * Math.PI * Math.sqrt(((a1 * rr) ** 2 + (b1 * rr) ** 2) / 2);
      const cols = Math.max(6, Math.round(per / SPACING));
      for (let j = 0; j < cols; j++) {
        const phi = ((j + (r % 2) * 0.5 + (rand() - 0.5) * 0.5) / cols) * Math.PI * 2;
        const [u, w] = superPoint(rr, rr, p, phi);
        const y = f.h + SHELL + relief(k, u * 0.98, w * 0.98);
        add(u * a1, w * b1 + tilt(k, 1), y, u * 0.4, w * 0.4, 1);
      }
    }
    add(0, tilt(k, 1), f.h + SHELL + relief(k, 0, 0), 0, 0, 1);
    centers.set(f.tooth.universal, [sum[0] / cnt, sum[1] / cnt, sum[2] / cnt]);
  }

  // Centre the cloud on the arch centre.
  const C = ARCH_CENTER[arch];
  const off: Vec3 = [-C[0], -C[1], -C[2]];
  for (let i = 0; i < P.length; i += 3) {
    P[i] += off[0];
    P[i + 1] += off[1];
    P[i + 2] += off[2];
  }
  for (const [u, c] of centers) centers.set(u, [c[0] + off[0], c[1] + off[1], c[2] + off[2]]);

  return {
    positions: new Float32Array(P),
    normals: new Float32Array(N),
    tooth: new Float32Array(T),
    rand: new Float32Array(R),
    count: P.length / 3,
    toothCenters: centers,
    offset: off,
  };
}

/** Contoured scanning-tray outline (dim points) used in the Scan animation. */
export function buildTrayCloud(arch: Arch = 'upper'): Float32Array {
  const pts: number[] = [];
  const frames = archFrames(arch).filter((f) => f.tooth.position <= 7);
  const C = ARCH_CENTER[arch];
  const off = [-C[0], -C[1], -C[2]];
  for (const f of frames) {
    for (let t = -f.w / 2; t <= f.w / 2; t += 0.9) {
      for (let n = -9; n <= 9; n += 0.9) {
        const y = -3.2 + 0.045 * n * n;
        const p = localToModel(f, t, n, y);
        pts.push(p[0] + off[0], p[1] + off[1], p[2] + off[2]);
      }
    }
  }
  return new Float32Array(pts);
}
