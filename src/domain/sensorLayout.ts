/** Authoritative Universal-number sensor layout supplied for OraCare. One entry = one physical SPOT. */
import { toothByUniversal } from './teeth';
import type { Arch } from './teeth';
import type { BiomarkerId } from './biomarkers';
import type { SensingSite, SensorReferenceSpot } from './types';

export function siteTeeth(site: Pick<SensingSite, 'toothUniversal' | 'contactWith'>): number[] {
  return site.contactWith == null ? [site.toothUniversal] : [site.toothUniversal, site.contactWith];
}
export function siteOnTooth(site: Pick<SensingSite, 'toothUniversal' | 'contactWith'>, tooth: number | null | undefined): boolean {
  return tooth != null && siteTeeth(site).includes(tooth);
}
const sites: SensingSite[] = [];
const sequence = new Map<BiomarkerId, number>();
function add(biomarker: BiomarkerId, toothUniversal: number, surface: SensingSite['surface'], extra: Partial<SensingSite> = {}) {
  const prefix = { pH: 'PH', calcium: 'CA', fluoride: 'F', ammonium: 'A', aMMP8: 'M' }[biomarker];
  const number = (sequence.get(biomarker) ?? 0) + 1;
  sequence.set(biomarker, number);
  const id = `${prefix}${String(number).padStart(3, '0')}`;
  sites.push({ id, toothUniversal, surface, biomarker, role: 'measure', footprintMm: 0.7, transmitters: [id], face: surface === 'buccal' ? 'buccal' : 'lingual', height: 'mid-crown', ...extra });
}
function contact(biomarker: BiomarkerId, first: number, second: number, gingival = false) {
  const surface = toothByUniversal(second).position > toothByUniversal(first).position ? 'distal' : 'mesial';
  add(biomarker, first, gingival ? 'gingival' : surface, { contactWith: second, face: 'lingual', height: gingival ? 'gingival-margin' : 'mid-crown' });
}
// Ammonia: four upper and four lower; the anterior 8/9 sensor is shared.
contact('ammonium', 8, 9); add('ammonium', 10, 'lingual');
contact('ammonium', 3, 2); contact('ammonium', 14, 15);
add('ammonium', 24, 'lingual', { offset: [0.65, 0] }); add('ammonium', 25, 'lingual', { offset: [0.65, 0] });
contact('ammonium', 30, 31); contact('ammonium', 19, 18);
// pH: six independent electrodes. The contact electrode is a measured site, not a reference.
add('pH', 8, 'lingual'); add('pH', 9, 'buccal');
add('pH', 3, 'lingual', { half: 'mesial' }); add('pH', 19, 'buccal', { half: 'mesial' });
add('pH', 27, 'lingual'); contact('pH', 4, 3);
sites[sites.length - 1].offset = [0, 0.6]; // Adjacent chips within the shared mid-crown contact zone.
// Calcium: 4 lower anterior + 8 posterior contacts + 4 distal-half molar surfaces.
for (const tooth of [23, 24, 25, 26]) add('calcium', tooth, 'lingual', { offset: tooth === 24 || tooth === 25 ? [-0.65, 0] : undefined });
for (const [first, second] of [[5, 4], [4, 3], [12, 13], [13, 14], [28, 29], [29, 30], [21, 20], [20, 19]]) contact('calcium', first, second);
for (const tooth of [3, 14, 30, 19]) add('calcium', tooth, 'lingual', { half: 'distal' });
// Fluoride: all four mid-crown corners on all 28 covered teeth.
for (const tooth of [...Array.from({ length: 14 }, (_, i) => i + 2), ...Array.from({ length: 14 }, (_, i) => i + 18)]) {
  for (const face of ['buccal', 'lingual'] as const) {
    for (const corner of ['mesial', 'distal'] as const) add('fluoride', tooth, face, { face, corner });
  }
}
// aMMP-8: lingual/palatal gum margin only; no subgingival placement.
for (const [first, second] of [[8, 7], [6, 5], [4, 3], [3, 2], [9, 10], [11, 12], [13, 14], [14, 15], [24, 23], [22, 21], [20, 19], [19, 18], [25, 26], [27, 28], [29, 30], [30, 31]]) contact('aMMP8', first, second, true);

export const SENSOR_SITES = sites;
export const SENSOR_REFERENCES: SensorReferenceSpot[] = [
  { id: 'K-UP', label: 'K⁺ reference', purpose: 'potassium-compensation', biomarker: 'ammonium', toothUniversal: 6, surface: 'lingual', face: 'lingual', height: 'mid-crown' },
  { id: 'K-LOW', label: 'K⁺ reference', purpose: 'potassium-compensation', biomarker: 'ammonium', toothUniversal: 27, surface: 'lingual', face: 'lingual', height: 'mid-crown', offset: [1.3, 0] },
  { id: 'M-REF-UP', label: 'aMMP-8 background reference', purpose: 'ammp8-background', biomarker: 'aMMP8', toothUniversal: 15, surface: 'gingival', face: 'lingual', height: 'gingival-margin' },
  { id: 'M-REF-LOW', label: 'aMMP-8 background reference', purpose: 'ammp8-background', biomarker: 'aMMP8', toothUniversal: 18, surface: 'gingival', face: 'lingual', height: 'gingival-margin' },
];
export const sitesForArch = (arch: Arch) => SENSOR_SITES.filter(site => toothByUniversal(site.toothUniversal).arch === arch);
export const referencesForArch = (arch: Arch) => SENSOR_REFERENCES.filter(site => toothByUniversal(site.toothUniversal).arch === arch);

/** The same contact is mesial on one tooth and distal on its neighbour. */
export function surfaceOnTooth(site: SensingSite, tooth: number): SensingSite['surface'] {
  if (site.height === 'gingival-margin') return 'gingival';
  if (site.contactWith == null) return site.surface;
  const other = siteTeeth(site).find(u => u !== tooth)!;
  return toothByUniversal(other).position > toothByUniversal(tooth).position ? 'distal' : 'mesial';
}
