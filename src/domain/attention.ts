import { BIOMARKERS, classify, type BiomarkerId } from './biomarkers';
import type { Scan, Strip } from './types';

/** Only reported, calibrated measurements outside the review range receive shading. */
export function attentionSites(scan: Scan | undefined, strip: Strip | undefined, mode: 'overview' | BiomarkerId = 'overview') {
  if (!scan || !strip || scan.stripId !== strip.id) return [];
  return strip.sites.filter(site => {
    if (site.role !== 'measure' || (mode !== 'overview' && site.biomarker !== mode)) return false;
    const reading = scan.readings.find(r => r.siteId === site.id && r.biomarker === site.biomarker);
    if (!reading || reading.value == null || !Number.isFinite(reading.value)) return false;
    const status = classify(reading.value, BIOMARKERS[site.biomarker].bands);
    return status === 'mild' || status === 'elevated' || status === 'high';
  });
}

/** Red is reserved for the highest concern band; orange means watch/review. */
export function attentionLevel(scan: Scan | undefined, site: import('./types').SensingSite): 'watch' | 'attention' {
  const reading = scan?.readings.find(r => r.siteId === site.id && r.biomarker === site.biomarker);
  return classify(reading?.value ?? null, BIOMARKERS[site.biomarker].bands) === 'high' ? 'attention' : 'watch';
}

export const ATTENTION_COLORS = { watch: '#E69A45', attention: '#E05252' } as const;
