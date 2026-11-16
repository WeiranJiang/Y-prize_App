/**
 * Biomarker registry. A strip lists which of these it measures; the demo
 * strips measure the five configured biomarkers (simulated). Thresholds are *configurable research thresholds*, not
 * diagnostic cut-offs.
 */
export type BiomarkerId = 'pH' | 'calcium' | 'fluoride' | 'ammonium' | 'aMMP8';
export type Support = 'active' | 'research' | 'planned';
export type Status = 'normal' | 'mild' | 'elevated' | 'high' | 'unavailable';

export interface Bands {
  configured?: boolean;
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
  /** Uncertainty model: base + k / SNR (biomarker units). */
  unc: [number, number];
  /** Plain-English direction of concern, e.g. "more acidic". */
  concernWord: string;
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
    unc: [0.04, 0.6],
    concernWord: 'more acidic',
    statusWords: {
      normal: 'Within range',
      mild: 'Slightly acidic',
      elevated: 'Elevated acidity',
      high: 'High acidity',
    },
  },

  calcium: {
    id: 'calcium',
    name: 'Calcium ions',
    shortName: 'Calcium',
    unit: 'mM',
    decimals: 2,
    support: 'research',
    what: 'Free calcium near the tooth surface, part of the mineral balance of enamel.',
    limitation: 'Calcium-ion readings are a research indicator of local mineral availability. They do not measure enamel loss directly.',
    bands: { concern: 'low', mild: 1.0, elevated: 0.7, high: 0.4 },
    range: [0, 2],
    unc: [0.03, 0.9],
    concernWord: 'lower',
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },

  fluoride: {
    id: 'fluoride',
    name: 'Fluoride',
    shortName: 'Fluoride',
    unit: 'ppm',
    decimals: 2,
    support: 'research',
    what: 'Fluoride available near the enamel surface.',
    limitation: 'Local fluoride is a research indicator and varies with when you last brushed.',
    bands: { concern: 'low', mild: 0.05, elevated: 0.03, high: 0.01 },
    range: [0, 0.3],
    unc: [0.004, 0.12],
    concernWord: 'lower',
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
  ammonium: {
    id: 'ammonium',
    name: 'Ammonia (NH₄⁺ sensor)',
    shortName: 'Ammonia',
    unit: 'mM',
    decimals: 1,
    support: 'research',
    what: 'A base produced by some oral bacteria that can buffer acid locally.',
    limitation: 'Ammonium is a research indicator of local acid buffering, not a diagnosis.',
    bands: { concern: 'low', mild: 3, elevated: 2, high: 1 },
    range: [0, 10],
    unc: [0.1, 4],
    concernWord: 'lower',
    statusWords: { normal: 'Within range', mild: 'Slightly low', elevated: 'Low', high: 'Very low' },
  },
  aMMP8: {
    id: 'aMMP8', name: 'Active MMP-8', shortName: 'aMMP-8', unit: '', decimals: 1, support: 'research',
    what: 'A sensor at the lingual or palatal gum margin samples gingival crevicular fluid for active MMP-8.',
    limitation: 'Locations are configured; calibrated values and validated thresholds have not been supplied. No readings or disease classifications are inferred.',
    bands: { configured: false, concern: 'high', mild: 0, elevated: 0, high: 0 },
    range: [0, 1], unc: [0, 0], concernWord: 'higher',
    statusWords: { normal: 'Not calibrated', mild: 'Not calibrated', elevated: 'Not calibrated', high: 'Not calibrated' },
  },
};

export const BIOMARKER_ORDER: BiomarkerId[] = ['ammonium', 'pH', 'calcium', 'fluoride', 'aMMP8'];
export const BIOMARKER_COLORS: Record<BiomarkerId, string> = { ammonium: '#F46CB5', pH: '#31C85B', calcium: '#4AA3FF', fluoride: '#FFD84A', aMMP8: '#AD55F5' };

export const STATUS_RANK: Record<Status, number> = { unavailable: -1, normal: 0, mild: 1, elevated: 2, high: 3 };

export const STATUS_LABEL: Record<Status, string> = {
  normal: 'Normal',
  mild: 'Mild',
  elevated: 'Elevated',
  high: 'High concern',
  unavailable: 'Unmeasured',
};

export function classify(value: number | null, bands: Bands): Status {
  if (bands.configured === false || value == null || Number.isNaN(value)) return 'unavailable';
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

export function formatDelta(b: Biomarker, d: number | null | undefined): string {
  if (d == null) return '—';
  const t = d.toFixed(b.decimals);
  if (Number(t) === 0) return (0).toFixed(b.decimals);
  return `${d > 0 ? '+' : ''}${t}`;
}

/** " mM" etc.; pH carries no unit suffix. */
export function unitSuffix(b: Biomarker): string {
  return !b.unit || b.unit === 'pH' ? '' : ` ${b.unit}`;
}

/** Value with name, e.g. "pH 5.4" or "Lactate 7.2 mM". */
export function formatReading(b: Biomarker, v: number | null | undefined): string {
  return v == null ? 'Not measured' : `${b.shortName} ${formatValue(b, v)}${unitSuffix(b)}`;
}
