/**
 * Biomarker registry. V1 hardware supports pH only; other analytes are
 * modelled so they can be enabled once a strip that measures them is
 * validated. Thresholds are *configurable research thresholds*, not
 * diagnostic cut-offs.
 */
export type BiomarkerId = 'pH' | 'lactate' | 'calcium' | 'phosphate' | 'fluoride' | 'ammonium';
export type Support = 'active' | 'research' | 'planned';
export type Status = 'normal' | 'mild' | 'elevated' | 'high' | 'unavailable';

export interface Bands {
  /** 'low' — lower values are of concern (pH). 'high' — higher values are of concern. */
  concern: 'low' | 'high';
  mild: number;
  elevated: number;
  high: number;
}

export interface Biomarker {
  id: BiomarkerId;
  name: string;
  shortName: string;
  unit: string;
  decimals: number;
  support: Support;
  /** Plain-English: what this measures. */
  what: string;
  /** Plain-English limitation shown wherever the value is shown. */
  limitation: string;
  bands: Bands;
  /** Axis range for charts. */
  range: [number, number];
  statusWords: Record<Exclude<Status, 'unavailable'>, string>;
}

export const BIOMARKERS: Record<BiomarkerId, Biomarker> = {
  pH: {
    id: 'pH',
    name: 'Local pH',
    shortName: 'pH',
    unit: 'pH',
    decimals: 1,
    support: 'active',
    what: 'How acidic the fluid is right next to this part of the retainer at the moment the strip was read.',
    limitation:
      'A local pH reading is a research indicator. It reflects conditions at readout, not your whole wear period, and it cannot diagnose decay on its own.',
    bands: { concern: 'low', mild: 6.5, elevated: 6.0, high: 5.5 },
    range: [4.5, 7.8],
    statusWords: {
      normal: 'Within range',
      mild: 'Slightly acidic',
      elevated: 'Elevated acidity',
      high: 'High acidity',
    },
  },
  lactate: {
    id: 'lactate',
    name: 'Lactate',
    shortName: 'Lactate',
    unit: 'mM',
    decimals: 1,
    support: 'research',
    what: 'A by-product of bacterial sugar metabolism; a local signal of acid production.',
    limitation: 'In research. Not measured by your current strip.',
    bands: { concern: 'high', mild: 2, elevated: 5, high: 10 },
    range: [0, 15],
    statusWords: { normal: 'Within range', mild: 'Slightly raised', elevated: 'Raised', high: 'High' },
  },
  calcium: {
    id: 'calcium',
    name: 'Calcium ions',
    shortName: 'Calcium',
    unit: 'mM',
    decimals: 2,
    support: 'research',
    what: 'Free calcium near the tooth surface, part of the mineral balance of enamel.',
    limitation: 'In research. Not measured by your current strip.',
    bands: { concern: 'low', mild: 1.0, elevated: 0.7, high: 0.4 },
    range: [0, 2],
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
  phosphate: {
    id: 'phosphate',
    name: 'Phosphate',
    shortName: 'Phosphate',
    unit: 'mM',
    decimals: 1,
    support: 'planned',
    what: 'Phosphate ions that, together with calcium, support enamel remineralisation.',
    limitation: 'Planned. Requires a future validated strip.',
    bands: { concern: 'low', mild: 3, elevated: 2, high: 1 },
    range: [0, 8],
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
  fluoride: {
    id: 'fluoride',
    name: 'Fluoride',
    shortName: 'Fluoride',
    unit: 'ppm',
    decimals: 2,
    support: 'planned',
    what: 'Fluoride available near the enamel surface.',
    limitation: 'Planned. Requires a future validated strip.',
    bands: { concern: 'low', mild: 0.05, elevated: 0.03, high: 0.01 },
    range: [0, 0.3],
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
  ammonium: {
    id: 'ammonium',
    name: 'Ammonium',
    shortName: 'Ammonium',
    unit: 'mM',
    decimals: 1,
    support: 'planned',
    what: 'A base produced by some oral bacteria that can buffer acid locally.',
    limitation: 'Planned. Requires a future validated strip.',
    bands: { concern: 'low', mild: 3, elevated: 2, high: 1 },
    range: [0, 10],
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
};

export const BIOMARKER_ORDER: BiomarkerId[] = ['pH', 'lactate', 'calcium', 'phosphate', 'fluoride', 'ammonium'];

export const STATUS_RANK: Record<Status, number> = { unavailable: -1, normal: 0, mild: 1, elevated: 2, high: 3 };

export const STATUS_LABEL: Record<Status, string> = {
  normal: 'Normal',
  mild: 'Mild',
  elevated: 'Elevated',
  high: 'High concern',
  unavailable: 'Unmeasured',
};

export function classify(value: number | null, bands: Bands): Status {
  if (value == null || Number.isNaN(value)) return 'unavailable';
  if (bands.concern === 'low') {
    if (value < bands.high) return 'high';
    if (value < bands.elevated) return 'elevated';
    if (value < bands.mild) return 'mild';
    return 'normal';
  }
  if (value > bands.high) return 'high';
  if (value > bands.elevated) return 'elevated';
  if (value > bands.mild) return 'mild';
  return 'normal';
}

export function formatValue(b: Biomarker, v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(b.decimals);
}
