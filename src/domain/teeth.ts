export type Arch = 'upper' | 'lower';
export type Side = 'right' | 'left';
export type ToothType = 'central incisor' | 'lateral incisor' | 'canine' | 'first premolar' | 'second premolar' | 'first molar' | 'second molar' | 'third molar';
export type NumberingSystem = 'universal' | 'fdi';

export interface Tooth {
  /** Universal Numbering System (1–32). Used as the canonical internal id. */
  universal: number;
  /** FDI World Dental Federation two-digit notation. */
  fdi: number;
  arch: Arch;
  /** Patient's side. */
  side: Side;
  /** 1 = central incisor … 8 = third molar. */
  position: number;
  type: ToothType;
  name: string;
  shortName: string;
}

const TYPES: ToothType[] = [
  'central incisor',
  'lateral incisor',
  'canine',
  'first premolar',
  'second premolar',
  'first molar',
  'second molar',
  'third molar',
];

const SHORT: Record<ToothType, string> = {
  'central incisor': 'Central incisor',
  'lateral incisor': 'Lateral incisor',
  canine: 'Canine',
  'first premolar': '1st premolar',
  'second premolar': '2nd premolar',
  'first molar': '1st molar',
  'second molar': '2nd molar',
  'third molar': '3rd molar',
};

function build(universal: number): Tooth {
  let arch: Arch;
  let side: Side;
  let position: number;
  let fdi: number;
  if (universal <= 8) {
    arch = 'upper'; side = 'right'; position = 9 - universal; fdi = 10 + position;
  } else if (universal <= 16) {
    arch = 'upper'; side = 'left'; position = universal - 8; fdi = 20 + position;
  } else if (universal <= 24) {
    arch = 'lower'; side = 'left'; position = 25 - universal; fdi = 30 + position;
  } else {
    arch = 'lower'; side = 'right'; position = universal - 24; fdi = 40 + position;
  }
  const type = TYPES[position - 1];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return {
    universal,
    fdi,
    arch,
    side,
    position,
    type,
    name: `${cap(arch)} ${side} ${type}`,
    shortName: SHORT[type],
  };
}

export const TEETH: Tooth[] = Array.from({ length: 32 }, (_, i) => build(i + 1));
export const toothByUniversal = (u: number): Tooth => TEETH[u - 1];
export const toothByFdi = (f: number): Tooth | undefined => TEETH.find((t) => t.fdi === f);

/** Teeth covered by the demo retainers (second molar to second molar, both arches). */
export const RETAINER_TEETH = TEETH.filter((t) => t.position <= 7);
export const retainerTeeth = (arch: Arch) => RETAINER_TEETH.filter((t) => t.arch === arch);

export function toothNumber(t: Tooth, system: NumberingSystem): string {
  return system === 'universal' ? `#${t.universal}` : `${t.fdi}`;
}

export function toothLabel(t: Tooth, system: NumberingSystem): string {
  return system === 'universal' ? `Tooth #${t.universal}` : `Tooth ${t.fdi} (FDI)`;
}

/**
 * Search teeth by number (Universal or FDI), or by words like
 * "upper right first molar", "canine", "UR6".
 */
export function searchTeeth(query: string, system: NumberingSystem): Tooth[] {
  const q = query.trim().toLowerCase().replace('#', '');
  if (!q) return [];
  const n = Number(q);
  if (Number.isInteger(n)) {
    const out: Tooth[] = [];
    const pref = system === 'universal' ? toothByUniversal(n) : toothByFdi(n);
    const alt = system === 'universal' ? toothByFdi(n) : n >= 1 && n <= 32 ? toothByUniversal(n) : undefined;
    if (pref && n >= 1) out.push(pref);
    if (alt && alt !== pref) out.push(alt);
    return out;
  }
  const words = q
    .replace(/\bur\b/g, 'upper right')
    .replace(/\bul\b/g, 'upper left')
    .replace(/\blr\b/g, 'lower right')
    .replace(/\bll\b/g, 'lower left')
    .replace(/1st/g, 'first')
    .replace(/2nd/g, 'second')
    .replace(/3rd/g, 'third')
    .split(/\s+/)
    .filter(Boolean);
  return TEETH.filter((t) => words.every((w) => t.name.toLowerCase().includes(w)));
}

/** Parse an untrusted route parameter into a valid Universal tooth number (1–32), or null. */
export function parseTooth(raw: unknown): number | null {
  if (typeof raw !== 'string' || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= 32 ? n : null;
}
