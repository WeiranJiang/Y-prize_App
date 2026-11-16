/**
 * Transparent, rule-based insight engine. Every insight records the rule
 * that fired, the biomarker and sites involved, the threshold or change
 * criterion, the measurement quality, and a confidence level — and keeps
 * Observed / Interpreted / Recommended separate. Nothing here diagnoses.
 */
import { analyzeScan, confidenceOf, persistentSites, ScanAnalysis, siteSeries, siteTitle, surfaceLabel } from './analysis';
import { BIOMARKERS, BiomarkerId, formatValue, Status, STATUS_RANK } from './biomarkers';
import type { StripHealth } from './fouling';
import { pct } from './fouling';
import { NumberingSystem, toothByUniversal } from './teeth';
import type { Scan, Strip } from './types';

export type InsightKind = 'finding' | 'stable' | 'quality' | 'strip' | 'routine';

export interface Insight {
  id: string;
  rule: string;
  kind: InsightKind;
  status: Status | 'info';
  title: string;
  summary: string;
  observed: string;
  interpreted: string;
  recommended: string;
  criterion: string;
  biomarker?: string;
  siteIds: string[];
  confidence: 'High' | 'Moderate' | 'Low';
  priority: number;
  action?: { label: string; href: string };
}

export interface Recommendation {
  id: string;
  text: string;
  why: string;
  insightId: string;
}

const f1 = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));

function regionPhrase(sites: { site: { toothUniversal: number } }[]) {
  const teeth = sites.map((s) => toothByUniversal(s.site.toothUniversal));
  const arch = teeth.every((t) => t.arch === 'upper') ? 'upper' : teeth.every((t) => t.arch === 'lower') ? 'lower' : '';
  const side = teeth.every((t) => t.side === 'right') ? 'right' : teeth.every((t) => t.side === 'left') ? 'left' : '';
  const zone = teeth.every((t) => t.position >= 4) ? 'posterior' : teeth.every((t) => t.position <= 3) ? 'anterior' : '';
  return `${arch} ${side} ${zone}`.replace(/\s+/g, ' ').trim() || 'monitored';
}

/** Biomarker-specific plain-English interpretation and advice. Never diagnostic. */
export const COPY: Record<BiomarkerId, { finding: string; repeated: string; interpret: string; single: string; advice: (interdental: boolean) => string; rec: string }> = {
  pH: {
    finding: 'Elevated acidity detected',
    repeated: 'Repeated low pH',
    interpret: 'The local environment at this measured location has been more acidic than the comparison site across recent scans. This can accompany plaque that is actively producing acid, but a pH reading alone does not show that a cavity is forming.',
    single: 'A single low reading can reflect a recent meal or drink, or local plaque. One scan is not enough to identify a pattern.',
    advice: (i) => (i ? 'Give extra attention to cleaning between these teeth (floss or an interdental brush), and mention the recurring readings at your next dental visit.' : 'Brush this area carefully along the gumline, and mention the recurring readings at your next dental visit.'),
    rec: 'Spend extra attention flossing between the highlighted',
  },
  lactate: {
    finding: 'Raised lactate detected',
    repeated: 'Repeated raised lactate',
    interpret: 'Lactate is produced when plaque bacteria ferment sugars. Higher local lactate suggests more acid-producing activity at this spot. It does not show damage to the tooth.',
    single: 'Lactate rises briefly after sugary food or drink. One raised reading is not a pattern.',
    advice: (i) => `Reduce how often you have sugary snacks and drinks between meals, and clean ${i ? 'between these teeth' : 'this area'} thoroughly.`,
    rec: 'Cut down on between-meal sugars and clean around the highlighted',
  },
  calcium: {
    finding: 'Low calcium detected',
    repeated: 'Repeatedly low calcium',
    interpret: 'Free calcium near the enamel has been lower than the configured range. Less available mineral can mean less natural repair at this spot. It does not measure enamel loss.',
    single: 'Calcium near the surface varies with saliva flow and recent meals. One low reading is not a pattern.',
    advice: () => 'Use a fluoride toothpaste twice daily and spit, don\'t rinse, after brushing. Ask your dentist whether a remineralising product suits you.',
    rec: 'Spit, don\'t rinse, after brushing near the highlighted',
  },
  phosphate: {
    finding: 'Low phosphate detected',
    repeated: 'Repeatedly low phosphate',
    interpret: 'Phosphate works with calcium to help enamel repair. Lower local phosphate means less mineral available at this spot. It is not a diagnosis.',
    single: 'Phosphate varies with saliva and diet. One low reading is not a pattern.',
    advice: () => 'Keep up fluoride toothpaste twice daily and stay well hydrated. Mention persistent readings to your dentist.',
    rec: 'Stay hydrated and keep your fluoride routine for the highlighted',
  },
  fluoride: {
    finding: 'Low fluoride detected',
    repeated: 'Repeatedly low fluoride',
    interpret: 'Little fluoride was available at this spot at readout. Fluoride levels fall naturally in the hours after brushing.',
    single: 'Fluoride drops between brushes. One low reading is expected and not a concern by itself.',
    advice: () => 'Brush with a fluoride toothpaste twice daily and spit, don\'t rinse, so fluoride stays on the teeth longer.',
    rec: 'Spit, don\'t rinse, after fluoride brushing near the highlighted',
  },
  ammonium: {
    finding: 'Low ammonium detected',
    repeated: 'Repeatedly low ammonium',
    interpret: 'Ammonium helps neutralise acid locally. Lower levels mean less natural buffering at this spot. It is a research indicator only.',
    single: 'Ammonium varies with diet and saliva. One low reading is not a pattern.',
    advice: () => 'Stay hydrated and keep your usual cleaning routine; mention persistent readings to your dentist.',
    rec: 'Stay hydrated and keep cleaning the highlighted',
  },
};

export function buildInsights(
  scan: Scan,
  strip: Strip,
  history: Scan[],
  health: StripHealth | null,
  system: NumberingSystem,
): { analysis: ScanAnalysis; insights: Insight[]; recommendations: Recommendation[] } {
  const a = analyzeScan(scan, strip, history);
  const out: Insight[] = [];
  const pHb = BIOMARKERS.pH.bands;
  const ref = a.comparison?.reading.value;
  const stripScans = history.filter((s) => +new Date(s.at) <= +new Date(scan.at));
  const persistent = persistentSites(strip, stripScans);
  const persistentIds = new Set(persistent.map((p) => p.site.id));

  // Rule R1 — repeated concern at a site (any biomarker)
  for (const p of persistent) {
    const r = a.results.find((x) => x.site.id === p.site.id)!;
    if (r.reading.value == null) continue;
    const bm = BIOMARKERS[r.site.biomarker];
    const c = COPY[r.site.biomarker];
    const t = siteTitle(r.site, system);
    const interdental = r.site.surface === 'mesial' || r.site.surface === 'distal';
    const thr = bm.bands.elevated;
    const cmp = bm.bands.concern === 'low' ? '<' : '>';
    out.push({
      id: `R1-${r.site.id}`,
      rule: `R1 · Repeated ${bm.shortName} finding`,
      kind: 'finding',
      status: r.status,
      title: `${c.repeated}${interdental ? ' at an interdental site' : ''}`,
      summary: `Your ${regionPhrase([r])} region read ${bm.concernWord} ${bm.shortName === 'pH' ? '' : `${bm.shortName.toLowerCase()} `}than the configured range in ${p.below} of your last ${p.valid} valid scans.`.replace('  ', ' '),
      observed: `${t.title} (${t.number}), ${t.surface.toLowerCase()}: ${bm.shortName} ${formatValue(bm, r.reading.value)} ± ${formatValue(bm, r.reading.uncertainty)} ${bm.unit === 'pH' ? '' : bm.unit}${r.site.biomarker === 'pH' && ref != null ? `; comparison site pH ${f1(ref)}` : ''}. ${cmp === '<' ? 'Below' : 'Above'} ${formatValue(bm, thr)} in ${p.below} of ${p.valid} recent valid scans.`,
      interpreted: c.interpret,
      recommended: c.advice(interdental),
      criterion: `Configured research threshold: ${bm.shortName} ${cmp} ${formatValue(bm, thr)} ${bm.unit === 'pH' ? '' : bm.unit} in ≥3 of the last 5 valid scans (readings outside the readout window excluded).`,
      biomarker: r.site.biomarker,
      siteIds: [r.site.id],
      confidence: confidenceOf(r.reading.quality) === 'Low' ? 'Moderate' : 'High',
      priority: 100 + STATUS_RANK[r.status] * 10 + (r.site.biomarker === 'pH' ? 2 : 0),
      action: { label: 'View site', href: `/?tooth=${r.site.toothUniversal}` },
    });
  }

  // Rule R2 — newly concerning reading (single-scan finding, any biomarker)
  const fresh = a.reviewSites.filter((r) => !persistentIds.has(r.site.id));
  for (const r of fresh) {
    const bm = BIOMARKERS[r.site.biomarker];
    const c = COPY[r.site.biomarker];
    const t = siteTitle(r.site, system);
    const cmp = bm.bands.concern === 'low' ? '<' : '>';
    out.push({
      id: `R2-${r.site.id}`,
      rule: `R2 · ${bm.shortName} at this scan`,
      kind: 'finding',
      status: r.status,
      title: c.finding,
      summary: `Your ${regionPhrase([r])} region read ${bm.concernWord} than usual at the ${t.surface.toLowerCase()} of ${t.number}.`,
      observed: `${t.title} (${t.number}), ${t.surface.toLowerCase()}: ${bm.shortName} ${formatValue(bm, r.reading.value)} ${bm.unit === 'pH' ? '' : bm.unit}${r.previous ? `, previously ${formatValue(bm, r.previous.value)}` : ''}${r.site.biomarker === 'pH' && ref != null ? `; comparison site pH ${f1(ref)}` : ''}.`,
      interpreted: c.single,
      recommended: `${c.advice(r.site.surface === 'mesial' || r.site.surface === 'distal')} Repeat your usual scan; if it recurs, the app will flag it as a repeated finding.`,
      criterion: `Configured research threshold: ${bm.shortName} ${cmp} ${formatValue(bm, bm.bands.elevated)} ${bm.unit === 'pH' ? '' : bm.unit} at the latest valid scan, not yet recurring.`,
      biomarker: r.site.biomarker,
      siteIds: [r.site.id],
      confidence: confidenceOf(r.reading.quality),
      priority: 80 + STATUS_RANK[r.status] * 10,
      action: { label: 'View site', href: `/?tooth=${r.site.toothUniversal}` },
    });
  }

  // Rule R3 — withheld readings (quality gating)
  if (a.withheld.length) {
    const fouling = health && (health.state === 'soon' || health.state === 'now');
    const names = a.withheld.map((r) => {
      const t = siteTitle(r.site, system);
      return `${t.tooth.name.toLowerCase()} (${t.surface.toLowerCase()})`;
    });
    out.push({
      id: 'R3',
      rule: 'R3 · Reading below quality floor',
      kind: 'quality',
      status: 'unavailable',
      title: a.withheld.length === 1 ? 'One area needs a repeat scan' : `${a.withheld.length} areas need a repeat scan`,
      summary: `Readout quality was insufficient near the ${names.join(', ')}.`,
      observed: `Optical signal-to-noise at ${a.withheld.map((r) => r.site.id).join(', ')} was below the floor (SNR ${a.withheld.map((r) => r.reading.snr.toFixed(0)).join(', ')}). Local transmission ${a.withheld.map((r) => pct(r.reading.transmission)).join(', ')} of baseline.`,
      interpreted: 'The value was withheld rather than estimated. Low signal here matches film build-up on the strip at this location, not a property of your teeth.',
      recommended: fouling
        ? 'Replace the sensing strip before your next scan. A repeat scan on this strip is unlikely to recover the signal.'
        : 'Before the next automatic readout, make sure the retainer is seated against the tray guides before closing the lid.',
      criterion: `Signal-quality floor: SNR ≥ ${health?.limits.snrFloor ?? 15}. Readings below it are never shown as measurements.`,
      siteIds: a.withheld.map((r) => r.site.id),
      confidence: 'High',
      priority: fouling ? 70 : 60,
      action: fouling ? { label: 'Strip health', href: '/strip' } : { label: 'Scan history', href: '/overview' },
    });
  }

  // Rule R4 — strip replacement
  if (health && (health.state === 'soon' || health.state === 'now')) {
    out.push({
      id: 'R4',
      rule: 'R4 · Strip replacement',
      kind: 'strip',
      status: health.state === 'now' ? 'high' : 'mild',
      title: health.headline,
      summary: health.detail,
      observed: `Reference-spot clarity ${health.clarity != null ? pct(health.clarity) : '—'} of baseline; ${health.sessions} sessions, day ${Math.floor(health.daysInUse) + 1} of ${health.limits.maxDays}.`,
      interpreted: 'Film on the strip reduces how much light the transmitters return. Readings are compensated, but uncertainty grows as clarity falls.',
      recommended: health.state === 'now' ? 'Fit a new sensing strip before your next scan.' : 'Have a new strip ready. Replace it within the forecast window.',
      criterion: `Replace when clarity < ${pct(health.limits.clarityReplace)}, forecast ≤ 3 sessions, usable sites < ${pct(health.limits.usableMin)}, or the ${health.limits.maxDays}-day / ${health.limits.maxSessions}-session limit is reached.`,
      siteIds: [],
      confidence: health.forecast && health.forecast.r2 > 0.9 ? 'High' : 'Moderate',
      priority: health.state === 'now' ? 120 : 75,
      action: { label: 'Strip health', href: '/strip' },
    });
  }

  // Rule R5 — readout outside window
  if (a.readoutLate) {
    out.push({
      id: 'R5',
      rule: 'R5 · Readout timing',
      kind: 'quality',
      status: 'mild',
      title: 'Read later than the protocol allows',
      summary: `The strip was read ${scan.readoutDelayMin.toFixed(0)} min after removal; the protocol window is ${scan.readoutWindowMin} min.`,
      observed: `Readout delay ${scan.readoutDelayMin.toFixed(1)} min (window ${scan.readoutWindowMin} min).`,
      interpreted: 'Local chemistry on the strip can change once it is out of the mouth, so these values may not reflect in-mouth conditions.',
      recommended: 'Place the retainer in the case promptly after removal for the next automatic readout.',
      criterion: `Protocol readout window: ${scan.readoutWindowMin} min (configurable).`,
      siteIds: [],
      confidence: 'High',
      priority: 65,
      action: { label: 'Scan history', href: '/overview' },
    });
  }

  // Rule R6 — calibration drift
  if (a.recalibrate.length) {
    out.push({
      id: 'R6',
      rule: 'R6 · Calibration drift',
      kind: 'quality',
      status: 'info',
      title: `${a.recalibrate.length} sensor${a.recalibrate.length > 1 ? 's' : ''} require${a.recalibrate.length > 1 ? '' : 's'} recalibration`,
      summary: 'Values from this sensor are still shown, with a wider uncertainty.',
      observed: a.recalibrate.map((r) => `${r.site.id}: estimated drift ${r.reading.drift.toFixed(2)} pH`).join('; '),
      interpreted: 'The sensor chemistry has aged faster than the rest of the strip.',
      recommended: 'No action needed now. Replacing the strip resets calibration.',
      criterion: 'Drift estimate > 0.12 pH units.',
      siteIds: a.recalibrate.map((r) => r.site.id),
      confidence: 'Moderate',
      priority: 30,
    });
  }

  // Rule R7 — stability at normal sites
  const stable = a.results.filter((r) => {
    if (r.site.role !== 'measure' || r.status !== 'normal') return false;
    const s = siteSeries(r.site.id, stripScans).filter((p) => p.value != null && p.calibrationVersion === scan.calibrationVersion).slice(-4);
    if (s.length < 3) return false;
    const vs = s.map((p) => p.value as number);
    return Math.max(...vs) - Math.min(...vs) < 0.3;
  });
  if (stable.length >= 2) {
    out.push({
      id: 'R7',
      rule: 'R7 · Stable sites',
      kind: 'stable',
      status: 'normal',
      title: 'Stable since your previous scans',
      summary: `No substantial change at ${stable.length} monitored ${regionPhrase(stable)} sites.`,
      observed: `${stable.length} sites stayed within a 0.3 pH range across their last valid scans on this strip.`,
      interpreted: 'Conditions at these locations look consistent over time.',
      recommended: 'No change suggested for these areas.',
      criterion: 'Range < 0.3 pH units over ≥3 valid scans with the same calibration.',
      siteIds: stable.map((r) => r.site.id),
      confidence: 'High',
      priority: 20,
    });
  }

  // Rule R8 — routine
  const mild = a.results.filter((r) => r.site.role === 'measure' && r.status === 'mild');
  out.push({
    id: 'R8',
    rule: 'R8 · Routine care',
    kind: 'routine',
    status: 'info',
    title: 'Keep your fluoride routine',
    summary: `${a.results.filter((r) => r.status === 'normal').length} of ${a.total} sites read within range${mild.length ? `; ${mild.length} slightly outside range` : ''}.`,
    observed: `${a.results.filter((r) => r.status === 'normal').length} sites within range at this scan.`,
    interpreted: 'Most monitored locations show no abnormal local acidity.',
    recommended: 'Maintain your usual fluoride toothpaste routine, twice daily.',
    criterion: 'Shown whenever results are available.',
    siteIds: [],
    confidence: 'High',
    priority: 10,
  });

  out.sort((x, y) => y.priority - x.priority);

  const recommendations: Recommendation[] = [];
  const add = (id: string, text: string, why: string, insightId: string) => {
    if (!recommendations.find((r) => r.id === id)) recommendations.push({ id, text, why, insightId });
  };
  for (const i of out) {
    if (recommendations.length >= 3) break;
    if (i.rule.startsWith('R1')) {
      const site = a.results.find((r) => r.site.id === i.siteIds[0])!;
      const bm = BIOMARKERS[site.site.biomarker];
      add(`rec-${site.site.biomarker}`, `${COPY[site.site.biomarker].rec} ${regionPhrase([site])} teeth.`, `${bm.shortName} was ${bm.concernWord} than the range again at the ${surfaceLabel(site.tooth, site.site.surface).toLowerCase()} of ${siteTitle(site.site, system).number}.`, i.id);
      add('dentist', 'Review recurring findings with your dentist.', 'The same site has crossed a research threshold in several recent scans.', i.id);
    } else if (i.rule.startsWith('R2')) {
      add('clean', 'Clean the highlighted area thoroughly and scan again tomorrow.', 'A single reading crossed the threshold; a repeat shows whether it recurs.', i.id);
    } else if (i.rule.startsWith('R4')) {
      add('strip', i.recommended, i.summary, i.id);
    } else if (i.rule.startsWith('R5')) {
      add('late', 'Repeat the scan if the retainer was out of your mouth too long before readout.', i.summary, i.id);
    } else if (i.rule.startsWith('R3')) {
      add('repeat', i.recommended, i.summary, i.id);
    } else if (i.rule.startsWith('R8')) {
      add('fluoride', 'Maintain your usual fluoride toothpaste routine.', i.summary, i.id);
    }
  }
  return { analysis: a, insights: out, recommendations };
}
