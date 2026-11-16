import { SURFACE_LABEL, SurfaceId } from './arch';
import { BIOMARKERS, BiomarkerId, classify, Status, STATUS_RANK } from './biomarkers';
import { NumberingSystem, Tooth, toothByUniversal, toothNumber } from './teeth';
import { siteTeeth } from './sensorLayout';
import type { Scan, SensingSite, SiteReading, Strip } from './types';

export interface SiteResult {
  site: SensingSite;
  tooth: Tooth;
  reading: SiteReading;
  status: Status;
  previous?: { value: number; at: string; comparable: boolean };
  change?: number;
}

export interface ScanAnalysis {
  scan: Scan;
  strip: Strip;
  results: SiteResult[];
  comparison?: SiteResult;
  reviewSites: SiteResult[];
  belowThreshold: SiteResult[];
  usable: number;
  total: number;
  recalibrate: SiteResult[];
  withheld: SiteResult[];
  readoutLate: boolean;
}

export function surfaceLabel(tooth: Tooth, surface: SurfaceId): string {
  if (surface === 'buccal' && tooth.position <= 3) return 'Labial';
  if (surface === 'lingual' && tooth.arch === 'upper') return 'Palatal';
  return SURFACE_LABEL[surface];
}

export function siteTitle(site: SensingSite, system: NumberingSystem = 'universal') {
  const tooth = toothByUniversal(site.toothUniversal);
  const numbers = siteTeeth(site).map(u => toothNumber(toothByUniversal(u), system));
  const face = surfaceLabel(tooth, site.face ?? site.surface);
  const location = site.contactWith != null
    ? `${face} contact${site.height === 'gingival-margin' ? ' · gum line' : ''}`
    : site.corner ? `${site.corner === 'mesial' ? 'Mesio' : 'Disto'}${face.toLowerCase()}`
    : `${face}${site.half ? ` · ${site.half} half` : ''}${site.height === 'gingival-margin' ? ' · gum line' : ''}`;
  return { tooth, title: site.contactWith ? `Contact ${numbers.join('/')}` : tooth.name,
    surface: location, number: numbers.join('/'),
    full: `${numbers.join('/')} — ${location}`,
  };
}

export function readingStatus(r: SiteReading | undefined): Status {
  if (!r) return 'unavailable';
  return classify(r.value, BIOMARKERS[r.biomarker].bands);
}

export function confidenceOf(quality: number): 'High' | 'Moderate' | 'Low' {
  if (quality >= 0.6) return 'High';
  if (quality >= 0.35) return 'Moderate';
  return 'Low';
}

export function scansComparable(a: Scan, b: Scan): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (a.calibrationVersion !== b.calibrationVersion)
    reasons.push(`Different calibration versions (${a.calibrationVersion} vs ${b.calibrationVersion}) — strips were changed between these scans.`);
  if (a.readoutDelayMin > a.readoutWindowMin || b.readoutDelayMin > b.readoutWindowMin)
    reasons.push('One scan was read outside the readout window.');
  const ca = a.references.reduce((s, r) => s + r.transmission, 0) / Math.max(1, a.references.length);
  const cb = b.references.reduce((s, r) => s + r.transmission, 0) / Math.max(1, b.references.length);
  if (Math.abs(ca - cb) > 0.2)
    reasons.push('Strip optical clarity differs substantially between scans, so measurement uncertainty is not equivalent.');
  return { ok: reasons.length === 0, reasons };
}

export function analyzeScan(scan: Scan, strip: Strip, history: Scan[]): ScanAnalysis {
  const earlier = history
    .filter((s) => +new Date(s.at) < +new Date(scan.at))
    .sort((a, b) => +new Date(b.at) - +new Date(a.at));
  const results: SiteResult[] = strip.sites.map((site) => {
    const reading = scan.readings.find((r) => r.siteId === site.id)!;
    const tooth = toothByUniversal(site.toothUniversal);
    let previous: SiteResult['previous'];
    for (const s of earlier) {
      const r = s.readings.find((x) => x.siteId === site.id);
      if (r?.value != null) {
        previous = { value: r.value, at: s.at, comparable: s.calibrationVersion === scan.calibrationVersion };
        break;
      }
    }
    return {
      site,
      tooth,
      reading,
      status: readingStatus(reading),
      previous,
      change: reading.value != null && previous ? Number((reading.value - previous.value).toFixed(2)) : undefined,
    };
  });
  const measured = results.filter((r) => r.site.role === 'measure');
  const comparison = results.find((r) => r.site.role === 'comparison');
  const reviewSites = measured
    .filter((r) => STATUS_RANK[r.status] >= 2)
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  const belowThreshold = measured.filter((r) => STATUS_RANK[r.status] >= 2);
  const withheld = results.filter((r) => r.reading.value == null && BIOMARKERS[r.site.biomarker].bands.configured !== false);
  return {
    scan,
    strip,
    results,
    comparison,
    reviewSites,
    belowThreshold,
    usable: results.filter(r => r.reading.value != null).length,
    total: results.length,
    recalibrate: results.filter((r) => r.reading.calibration === 'recalibrate' && r.reading.value != null),
    withheld,
    readoutLate: scan.readoutDelayMin > scan.readoutWindowMin,
  };
}

/** Time series for one site, oldest first. Null values mark scans where the site was not usable. */
export function siteSeries(siteId: string, scans: Scan[], biomarker: BiomarkerId = 'pH') {
  return scans
    .slice()
    // Only scans whose strip carries this site; a withheld reading (value null) stays as a gap.
    .filter((s) => s.readings.some((x) => x.siteId === siteId && x.biomarker === biomarker))
    .sort((a, b) => +new Date(a.at) - +new Date(b.at))
    .map((s) => {
      const r = s.readings.find((x) => x.siteId === siteId && x.biomarker === biomarker);
      return {
        at: s.at,
        scanId: s.id,
        stripId: s.stripId,
        value: r?.value ?? null,
        quality: r?.quality ?? 0,
        uncertainty: r?.uncertainty ?? 0,
        late: s.readoutDelayMin > s.readoutWindowMin,
        calibrationVersion: s.calibrationVersion,
      };
    });
}

/** Sites below the elevated threshold in at least `minCount` of the last `window` valid readings. */
export function persistentSites(strip: Strip, scans: Scan[], window = 5, minCount = 3) {
  return strip.sites
    .filter((s) => s.role === 'measure')
    .map((site) => {
      const b = BIOMARKERS[site.biomarker].bands;
      const valid = siteSeries(site.id, scans, site.biomarker)
        .filter((p) => p.value != null && !p.late)
        .slice(-window);
      const below = valid.filter((p) => classify(p.value, b) === 'elevated' || classify(p.value, b) === 'high');
      return { site, valid: valid.length, below: below.length };
    })
    .filter((x) => x.below >= minCount)
    .sort((a, b) => b.below - a.below);
}
