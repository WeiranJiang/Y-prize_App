/**
 * SPOT assistant. A friendly, plain-spoken guide that answers questions about
 * the user's own readings, and general oral-health questions, tying answers
 * back to their data where it helps. It never diagnoses, and it points to a
 * dentist for symptoms.
 *
 * By default it runs on-device (works offline, demo data). If
 * EXPO_PUBLIC_CHAT_URL is set, questions are sent with a compact summary of
 * the user's data to a server (see /server) that answers with Claude.
 */
import { siteTitle } from './analysis';
import type { ScanAnalysis, SiteResult } from './analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, formatValue, STATUS_RANK, unitSuffix } from './biomarkers';
import type { StripHealth } from './fouling';
import { pct } from './fouling';
import { COPY, Insight, Recommendation } from './insights';
import type { Overview } from './overview';
import { Arch, NumberingSystem, searchTeeth, toothByUniversal, toothNumber } from './teeth';

export interface SiteTrend {
  from: number;
  to: number;
  days: number;
}

export interface ArchSnapshot {
  arch: Arch;
  analysis?: ScanAnalysis;
  insights: Insight[];
  recommendations: Recommendation[];
  health: StripHealth;
  /** Two-week change per site id (first → latest valid reading). */
  trends?: Record<string, SiteTrend>;
}

export interface AssistantContext {
  arches: ArchSnapshot[];
  overview: Overview;
  numbering: NumberingSystem;
  supply: Record<Arch, number>;
  planMode: 'auto' | 'manual';
}

/** What the conversation is currently about, so follow-ups like "why?" work. */
export interface Topic {
  tooth?: number;
  bio?: BiomarkerId;
}

export interface Reply {
  text: string;
  suggestions?: string[];
  topic?: Topic;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BIO_WORDS: [RegExp, BiomarkerId][] = [
  [/\b(ph|acid|acidic|acidity)\b/, 'pH'],
  [/\b(lactate|lactic)/, 'lactate'],
  [/\bcalcium\b/, 'calcium'],
  [/\bphosphate\b/, 'phosphate'],
  [/\bfluorid/, 'fluoride'],
  [/\bammoni/, 'ammonium'],
];

const has = (q: string, re: RegExp) => re.test(q);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Deterministic variety so replies don't all open the same way. */
function pick<T>(q: string, options: T[]): T {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) >>> 0;
  return options[h % options.length];
}

function results(ctx: AssistantContext): SiteResult[] {
  return ctx.arches.flatMap((a) => a.analysis?.results ?? []);
}
function concerns(ctx: AssistantContext, bio?: BiomarkerId, min = 2) {
  return results(ctx)
    .filter((r) => STATUS_RANK[r.status] >= min && (!bio || r.site.biomarker === bio))
    .sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
}
function trendOf(ctx: AssistantContext, siteId: string): SiteTrend | undefined {
  for (const a of ctx.arches) if (a.trends?.[siteId]) return a.trends[siteId];
  return undefined;
}
function where(r: SiteResult, n: NumberingSystem) {
  const t = siteTitle(r.site, n);
  return `${t.number} (${lowerFirst(t.tooth.name)}, ${t.surface.toLowerCase()})`;
}
function value(r: SiteResult) {
  const b = BIOMARKERS[r.site.biomarker];
  return r.reading.value == null ? 'no reading' : `${formatValue(b, r.reading.value)}${unitSuffix(b)}`;
}
/** "high acidity" for pH, otherwise "raised lactate", "low calcium". */
function phrase(r: SiteResult) {
  const b = BIOMARKERS[r.site.biomarker];
  if (r.status === 'normal') return `${b.shortName === 'pH' ? 'pH' : lowerFirst(b.shortName)} in range`;
  if (r.status === 'unavailable') return `no ${b.shortName === 'pH' ? 'pH' : lowerFirst(b.shortName)} reading`;
  const w = lowerFirst(b.statusWords[r.status]);
  return r.site.biomarker === 'pH' ? w : `${w} ${lowerFirst(b.shortName)}`;
}
const listJoin = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function word(r: SiteResult) {
  const b = BIOMARKERS[r.site.biomarker];
  return r.status === 'normal' ? 'in range' : r.status === 'unavailable' ? 'not measured' : lowerFirst(b.statusWords[r.status]);
}
/** "pH has fallen from 6.3 to 5.4 over the last two weeks" */
function trendSentence(r: SiteResult, ctx: AssistantContext): string | null {
  const t = trendOf(ctx, r.site.id);
  if (!t) return null;
  const b = BIOMARKERS[r.site.biomarker];
  const span = b.range[1] - b.range[0];
  const d = t.to - t.from;
  if (Math.abs(d) < span * 0.02) return `${b.shortName} there has held steady around ${formatValue(b, t.to)}${unitSuffix(b)}`;
  const dir = d < 0 ? 'fallen' : 'risen';
  const good = (b.bands.concern === 'low') === d > 0;
  return `${b.shortName} there has ${dir} from ${formatValue(b, t.from)} to ${formatValue(b, t.to)}${unitSuffix(b)} over the last ${t.days < 10 ? `${Math.round(t.days)} days` : 'two weeks'}${good ? ', which is the right direction' : ''}`;
}
/** Sites moving fastest in the wrong direction, normalised by each biomarker's range. */
function movers(ctx: AssistantContext) {
  return results(ctx)
    .map((r) => {
      const t = trendOf(ctx, r.site.id);
      if (!t) return null;
      const b = BIOMARKERS[r.site.biomarker];
      const adverse = ((t.to - t.from) / (b.range[1] - b.range[0])) * (b.bands.concern === 'low' ? -1 : 1);
      return { r, adverse };
    })
    .filter((x): x is { r: SiteResult; adverse: number } => !!x && x.adverse > 0.04)
    .sort((a, b) => b.adverse - a.adverse);
}
const interdental = (r: SiteResult) => r.site.surface === 'mesial' || r.site.surface === 'distal';

function findTooth(q: string, n: NumberingSystem) {
  const num = q.match(/(?:#|tooth\s*|number\s*)?\b(\d{1,2})\b/);
  if (num) {
    const t = searchTeeth(num[1], n)[0];
    if (t) return t;
  }
  if (/\b(upper|lower)\b.*\b(incisor|canine|premolar|molar)\b/.test(q)) return searchTeeth(q.replace(/[^a-z0-9 ]/g, ''), n)[0];
  return undefined;
}

// ── Personal answers ───────────────────────────────────────────────────────

function overall(ctx: AssistantContext, q: string): Reply {
  const o = ctx.overview;
  const c = concerns(ctx);
  const teeth = [...new Set(c.map((r) => r.site.toothUniversal))];
  const opener = pick(q, ['Here’s the big picture.', 'Overall, things look mostly good.', 'Quick summary of where you are:']);
  const dir = o.direction === 'improving' ? 'heading the right way' : o.direction === 'worsening' ? 'drifting a little in the wrong direction lately' : 'holding steady';
  let text = `${opener} About ${o.overall != null ? Math.round(o.overall * 100) : '—'}% of your readings are in range, and things are ${dir}.`;
  if (teeth.length) {
    const t = toothByUniversal(teeth[0]);
    const here = c.filter((r) => r.site.toothUniversal === teeth[0]);
    const kinds = new Set(here.map((r) => r.site.biomarker));
    text += `\n\nThe spot I’d keep an eye on is your ${lowerFirst(t.name)} (${toothNumber(t, ctx.numbering)}), which shows ${listJoin(here.map(phrase))}.`;
    if (kinds.has('pH') && (kinds.has('lactate') || kinds.has('calcium'))) text += ' When those show up together, it usually means plaque has been sitting there and fermenting sugars.';
    if (teeth.length > 1) text += ` ${teeth.length - 1 === 1 ? 'One other tooth has' : `${teeth.length - 1} other teeth have`} something worth a look too.`;
  } else text += `\n\nNothing is past a concern threshold right now. Nice work.`;
  return { text, suggestions: teeth.length ? [`Tell me about tooth #${teeth[0]}`, 'What should I do this week?', 'What’s changed recently?'] : ['What should I do this week?'], topic: teeth.length ? { tooth: teeth[0] } : undefined };
}

function attention(ctx: AssistantContext): Reply {
  const c = concerns(ctx).slice(0, 6);
  if (!c.length) return { text: 'Nothing needs attention right now. Every monitored spot is either in range or only borderline. Keep doing what you’re doing.' };
  const byTooth = new Map<number, SiteResult[]>();
  c.forEach((r) => byTooth.set(r.site.toothUniversal, [...(byTooth.get(r.site.toothUniversal) ?? []), r]));
  const lines = [...byTooth.entries()].map(([u, rs]) => {
    const t = toothByUniversal(u);
    return `• ${toothNumber(t, ctx.numbering)} ${lowerFirst(t.name)}: ${rs.map((r) => `${BIOMARKERS[r.site.biomarker].shortName} ${value(r)} (${word(r)})`).join(', ')}`;
  });
  const first = c[0].site.toothUniversal;
  return {
    text: `These are the spots from your latest scan that crossed a threshold:\n${lines.join('\n')}\n\nThe pattern is mostly back teeth, and mostly between teeth or along the gumline. Those are the places a brush misses most easily.`,
    suggestions: [`Tell me about tooth #${first}`, 'How do I floss properly?', 'What should I do this week?'],
    topic: { tooth: first },
  };
}

function tooth(ctx: AssistantContext, u: number): Reply {
  const t = toothByUniversal(u);
  const snap = ctx.arches.find((a) => a.arch === t.arch);
  const rows = (snap?.analysis?.results ?? []).filter((r) => r.site.toothUniversal === u).sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
  if (!rows.length)
    return { text: `There isn’t a sensor on your ${lowerFirst(t.name)} (${toothNumber(t, ctx.numbering)}), so I don’t have readings for it. I won’t guess from neighbouring teeth, because conditions can differ a lot from one spot to the next.`, topic: { tooth: u } };
  const bad = rows.filter((r) => STATUS_RANK[r.status] >= 1);
  const lines = rows.slice(0, 5).map((r) => `• ${BIOMARKERS[r.site.biomarker].shortName} at the ${siteTitle(r.site).surface.toLowerCase()}: ${value(r)}, ${word(r)}`);
  let text = `Here’s your ${lowerFirst(t.name)} (${toothNumber(t, ctx.numbering)}):\n${lines.join('\n')}`;
  const tr = bad.length ? trendSentence(bad[0], ctx) : null;
  if (tr) text += `\n\n${tr}.`;
  if (bad.length >= 2) text += ` Several markers point the same way here, which makes it more likely to be a real local pattern than a one-off blip.`;
  text += bad.length ? `\n\nWhat I’d do: ${COPY[bad[0].site.biomarker].advice(interdental(bad[0]))}` : `\n\nEverything here is in range. Nothing to change.`;
  return { text, suggestions: bad.length ? ['Why is this happening?', 'How has it changed?', 'How do I floss properly?'] : ['How are my teeth overall?'], topic: { tooth: u, bio: bad[0]?.site.biomarker } };
}

function biomarker(ctx: AssistantContext, bio: BiomarkerId): Reply {
  const b = BIOMARKERS[bio];
  const sum = ctx.overview.biomarkers.find((x) => x.id === bio);
  const c = concerns(ctx, bio, 1);
  const trend = sum?.direction === 'improving' ? 'it’s improving' : sum?.direction === 'worsening' ? 'it’s been heading the wrong way lately' : 'it’s been steady';
  let text = `${b.name}: ${lowerFirst(b.what)}\n\nFor you, ${sum?.inRange != null ? `${Math.round(sum.inRange * 100)}% of readings are in range` : 'there are no recent readings'}, and ${trend}.`;
  if (c.length) text += ` The ones to watch: ${c.slice(0, 3).map((r) => `${where(r, ctx.numbering)} at ${value(r)}`).join('; ')}.`;
  text += `\n\n${COPY[bio].advice(c.some(interdental))}`;
  return { text, suggestions: ['Why does this matter?', 'Which teeth need attention?'], topic: { bio, tooth: c[0]?.site.toothUniversal } };
}

function changes(ctx: AssistantContext, topic?: Topic): Reply {
  if (topic?.tooth) {
    const rows = results(ctx).filter((r) => r.site.toothUniversal === topic.tooth);
    const lines = rows.map((r) => trendSentence(r, ctx)).filter(Boolean) as string[];
    const t = toothByUniversal(topic.tooth);
    return {
      text: lines.length ? `Over the last couple of weeks on your ${lowerFirst(t.name)}:\n${lines.map((l) => `• ${l}`).join('\n')}\n\nYou can drag through every scan in the magnifier on Home to see it change visually.` : `I don’t have enough recent scans on that tooth to show a trend yet.`,
      topic,
    };
  }
  const m = movers(ctx).slice(0, 3);
  const o = ctx.overview;
  let text = `Overall your readings are ${o.direction === 'improving' ? 'improving' : o.direction === 'worsening' ? 'slipping a bit' : 'fairly steady'} compared with a couple of weeks ago.`;
  if (m.length) text += `\n\nThe biggest moves in the wrong direction:\n${m.map(({ r }) => `• ${where(r, ctx.numbering)}: ${trendSentence(r, ctx)}`).join('\n')}`;
  else text += ` Nothing has moved much in the wrong direction.`;
  return { text, suggestions: m.length ? [`Tell me about tooth #${m[0].r.site.toothUniversal}`] : undefined, topic: m.length ? { tooth: m[0].r.site.toothUniversal } : undefined };
}

const WHY: Record<BiomarkerId, string> = {
  pH: 'That spot is more acidic than the rest of your mouth. Bacteria in plaque turn sugars and starches into acid, and in a tucked-away spot, like between back teeth, that acid lingers because saliva can’t easily wash it out.',
  lactate: 'Lactate is the acid plaque bacteria make when they ferment sugar. A high reading means bacteria at that spot have been busy, usually because plaque has built up there and sugar reaches it often.',
  calcium: 'Enamel constantly loses and regains minerals. When a spot stays acidic, less free calcium is left over to rebuild it, so low calcium often follows low pH.',
  phosphate: 'Phosphate is the other half of enamel’s repair kit, alongside calcium. It dips when acid lingers or saliva flow is low.',
  fluoride: 'Fluoride levels naturally fall in the hours after brushing. Low readings usually just mean it’s been a while since fluoride toothpaste, or you rinsed it away.',
  ammonium: 'Some bacteria make ammonium, which neutralises acid. Lower levels mean a little less natural buffering, often linked to diet or saliva flow.',
};

function explain(ctx: AssistantContext, topic?: Topic): Reply {
  const bio = topic?.bio ?? (topic?.tooth ? concerns(ctx, undefined, 1).find((r) => r.site.toothUniversal === topic.tooth)?.site.biomarker : undefined);
  if (bio) {
    const together =
      topic?.tooth && concerns(ctx, undefined, 1).filter((r) => r.site.toothUniversal === topic.tooth).length > 1
        ? ' Here several markers are off at once, which fits that picture: acid being made, sitting there, and minerals being drawn down.'
        : '';
    return {
      text: `${WHY[bio]}${together}\n\nThe good news is that this is an early signal, not damage. Better cleaning in that exact spot and fewer sugary top-ups usually move these numbers within a week or two.`,
      suggestions: ['What should I do about it?', 'How has it changed?'],
      topic: { ...topic, bio },
    };
  }
  return {
    text: 'The strip reads the chemistry right next to each tooth: how acidic it is, how much acid bacteria are making, and how much mineral is around to repair enamel. Spots where plaque sits longest, usually between back teeth and along the gumline, tend to read worst. That’s why the advice keeps coming back to cleaning those places.',
    suggestions: ['Which teeth need attention?', 'How do I floss properly?'],
  };
}

function plan(ctx: AssistantContext): Reply {
  const c = concerns(ctx);
  const recs = ctx.arches.flatMap((a) => a.recommendations).filter((r, i, arr) => arr.findIndex((x) => x.text === r.text) === i);
  const lines: string[] = [];
  if (c.some(interdental)) lines.push('Clean between your back teeth once a day, floss or an interdental brush, and take your time on the spots flagged in the app.');
  if (c.some((r) => r.site.biomarker === 'lactate' || r.site.biomarker === 'pH')) lines.push('Keep sugary snacks and drinks to mealtimes rather than grazing. How often you eat sugar matters more than how much.');
  if (c.some((r) => r.site.biomarker === 'calcium' || r.site.biomarker === 'phosphate')) lines.push('After brushing with fluoride toothpaste, spit, don’t rinse. It leaves fluoride on the enamel to help it remineralise.');
  const covered = (t: string) => (/floss|between/i.test(t) && lines.some((l) => /between/i.test(l))) || (/sugar/i.test(t) && lines.some((l) => /sugar/i.test(l))) || (/rinse/i.test(t) && lines.some((l) => /rinse/i.test(l)));
  for (const r of recs) if (lines.length < 4 && !covered(r.text)) lines.push(r.text);
  if (!lines.length) lines.push('Keep brushing twice a day with fluoride toothpaste and cleaning between your teeth. Your readings say it’s working.');
  return {
    text: `Here’s what I’d focus on this week:\n${lines.slice(0, 4).map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\nScan again in a few days and you’ll see in the Findings tab whether it’s helping.`,
    suggestions: ['How do I floss properly?', 'What about acidic drinks?'],
  };
}

// ── General knowledge (personalised where the data helps) ──────────────────

function general(q: string, ctx: AssistantContext): Reply | null {
  const ph = concerns(ctx, 'pH', 1);
  const lac = concerns(ctx, 'lactate', 1);
  const interdentalBad = concerns(ctx).filter(interdental);

  if (has(q, /\bfloss|interdental|between (my )?teeth|water ?pick|waterflos/))
    return {
      text: `Good question, because for you this is probably the single most useful habit.\n\n• Use about 40 cm of floss, wrapped around your middle fingers.\n• Slide it gently between the teeth, curve it into a “C” around one tooth and move it up and down under the gumline, then do the same for the neighbouring tooth.\n• Don’t snap it down; that’s what makes gums sore.\n• If your gaps are bigger, interdental brushes are often easier and more effective. A water flosser is a decent extra but doesn’t fully replace them.\n${interdentalBad.length ? `\nFor you specifically, focus on ${listJoin([...new Set(interdentalBad.map((r) => toothNumber(toothByUniversal(r.site.toothUniversal), ctx.numbering)))])}. Those between-teeth spots are reading the worst.` : ''}`,
      suggestions: ['How should I brush?', 'What should I do this week?'],
    };
  if (has(q, /\bbrush|toothbrush|electric\b/))
    return {
      text: 'The basics that actually make a difference:\n• Twice a day for two minutes, with a soft brush.\n• Angle the bristles about 45° toward the gumline and use small, gentle circles. Scrubbing hard wears gums and enamel.\n• Electric brushes make good technique easier, especially the timer and pressure sensor, but a manual brush used well is fine.\n• Spit after brushing, don’t rinse, so the fluoride stays on your teeth.\n\nYour readings are worst along the gumline and between back teeth, so slow down there.',
      suggestions: ['How do I floss properly?', 'Which toothpaste should I use?'],
    };
  if (has(q, /toothpaste|fluoride toothpaste|which paste/))
    return {
      text: `Look for a fluoride toothpaste with about 1,350–1,500 ppm fluoride (most standard adult pastes). If you get sensitivity, a “sensitive” formula with stannous fluoride or potassium nitrate helps. Use a pea-sized amount, and spit rather than rinse.${concerns(ctx, 'calcium', 1).length ? ' With a couple of your calcium readings on the low side, that spit-don’t-rinse habit is worth being strict about.' : ''}`,
    };
  if (has(q, /mouthwash|mouth wash|rinse/))
    return {
      text: 'Mouthwash is optional. If you use one, pick an alcohol-free fluoride rinse and use it at a different time from brushing (say, after lunch), so you don’t wash away your toothpaste’s fluoride. It’s an add-on, not a replacement for brushing and cleaning between teeth.',
    };
  if (has(q, /coffee|soda|cola|pop\b|juice|sparkling|fizzy|wine|kombucha|lemon|citrus|energy drink|sports drink|acidic drink|drinks?\b/))
    return {
      text: `Acidic drinks lower the pH in your mouth for a while after each sip. The habit matters more than the drink:\n• Have them with meals rather than sipping over hours.\n• Use a straw for sodas and juices if you can.\n• Swish with water afterwards.\n• Wait 30–60 minutes before brushing after something acidic, so you’re not brushing softened enamel.\n• Black coffee is only mildly acidic. Sugar and milk sipped slowly through the day is the bigger issue.${ph.length ? `\n\nYour pH is already low at ${ph.slice(0, 2).map((r) => toothNumber(toothByUniversal(r.site.toothUniversal), ctx.numbering)).join(' and ')}, so cutting down on slow sipping would help there.` : ''}`,
      topic: { bio: 'pH' },
    };
  if (has(q, /sugar|snack|candy|sweets|chocolate|diet|food|eat|gum\b|chewing gum|xylitol/))
    return {
      text: `What matters most is how often, not how much. Every sugary snack gives plaque bacteria about 20–30 minutes of acid-making, so grazing all afternoon keeps your teeth in that zone.\n• Keep sweets to mealtimes.\n• Good snacks: cheese, nuts, plain yoghurt, crunchy vegetables.\n• Sugar-free gum, especially with xylitol, after eating boosts saliva, which neutralises acid.${lac.length ? `\n\nYour lactate is raised at ${lac.slice(0, 2).map((r) => toothNumber(toothByUniversal(r.site.toothUniversal), ctx.numbering)).join(' and ')}. That’s exactly the signal of bacteria fermenting sugar, so this is a lever that should show up in your next scans.` : ''}`,
      topic: { bio: 'lactate' },
    };
  if (has(q, /dry mouth|saliva|thirst|hydrat|water intake|mouth breath/))
    return {
      text: 'Saliva is your mouth’s natural defence: it washes away sugars, buffers acid and carries the calcium and phosphate that repair enamel. If your mouth often feels dry, drink water through the day, try sugar-free gum, and mention it to your dentist or doctor, since many medications cause it. Breathing through your mouth at night, common with retainers, also dries things out.',
      suggestions: ['What about my ammonium readings?'],
    };
  if (has(q, /bad breath|halitosis|breath smell/))
    return {
      text: 'Most bad breath comes from bacteria on the back of the tongue and between teeth. A tongue scraper, daily cleaning between teeth, staying hydrated and cleaning your retainer properly usually fix it. If it hangs around despite that, it’s worth a dental check, because gum problems can cause it.',
      suggestions: ['How should I clean my retainer?'],
    };
  if (has(q, /retainer|clean (my|the) case|aligner/))
    return {
      text: 'Retainer care that keeps both your retainer and the sensing strip working well:\n• Rinse it in cool water every time you take it out. Hot water can warp it.\n• Brush it gently with a soft brush and mild soap, not toothpaste, which scratches.\n• Keep it in its case, never wrapped in a tissue.\n• Brush your teeth before putting it back in, so you’re not trapping food against the teeth.\n• Don’t wipe or rinse the sensing strip before a scan. That changes what it reads.',
      suggestions: ['When should I replace my strips?'],
    };
  if (has(q, /sensitiv/))
    return {
      text: 'Sensitivity to cold or sweet usually means some dentine is exposed. A sensitive toothpaste (stannous fluoride or potassium nitrate), used for a couple of weeks and smeared on the spot at night, often helps. Brush gently and avoid whitening for now. If it’s new, sharp, or limited to one tooth, get it checked by a dentist.',
    };
  if (has(q, /whiten|bleach|white teeth/))
    return {
      text: `Whitening is generally safe when supervised, but peroxide can make teeth temporarily sensitive.${concerns(ctx, 'calcium', 1).length ? ' With some of your calcium readings on the low side, I’d bring this up with your dentist first and give enamel-friendly habits a few weeks.' : ' Talk to your dentist about the best option for you.'}`,
    };
  if (has(q, /smok|vape|vaping|nicotine/))
    return {
      text: 'Smoking and vaping both dry the mouth and reduce blood flow to the gums, which hides bleeding and makes gum disease easier to miss. Cutting down is one of the best things you can do for your gums. If you’d like help quitting, your doctor or pharmacist can point you to support.',
    };
  if (has(q, /gum|gingiv|periodont/))
    return {
      text: 'Healthy gums are firm, pink and don’t bleed when you brush. The best protection is gentle brushing angled at the gumline plus daily cleaning between teeth. Bleeding, swelling or receding gums are worth a dental visit. The strip can’t assess gum health directly.',
    };
  if (has(q, /what (does|do) (the )?(colou?rs?|green|amber|red|yellow)|legend|what.*mean/))
    return {
      text: 'Green means in range, amber is borderline and worth watching, and red needs attention, meaning a reading crossed a research threshold. A gray ring means the sensor couldn’t get a reliable reading, so we show nothing rather than guess. Plain white dots on the 3D model are simply in range.',
    };
  if (has(q, /how (do|to) (i )?scan|start a scan|scanning|the case/))
    return {
      text: 'Tap the scan icon at the top of Home. Wear your retainer with the strip for the session, take it out, place it in the case’s tray, lined up with the guides, and close the lid. The case reads both retainers and your results appear within a few seconds. Try to read it within 5 minutes of taking it out, and don’t rinse the strip first.',
    };
  if (has(q, /magnif|zoom|timeline|drag/))
    return {
      text: 'Tap any tooth on Home to open the magnifier. Drag the timeline (or press play) to replay every scan and watch that tooth change. In the Findings tab you can choose a date range and the biomarkers you care about.',
    };
  if (has(q, /cavity|cavities|decay|caries|diagnos|hole/)) {
    const c = concerns(ctx, 'pH');
    return {
      text: `I can’t tell you whether you have a cavity. The strip measures the chemistry around your teeth, not the teeth themselves, and only a dentist’s exam or X-ray can find decay.\n\nWhat the readings are good for is early warning: ${c.length ? `${plural(c.length, 'spot')} ${c.length === 1 ? 'is' : 'are'} more acidic than they should be, which is the kind of environment where decay can start if it stays that way. Worth mentioning at your next visit.` : 'right now nothing is unusually acidic, which is reassuring.'}`,
      suggestions: ['What should I tell my dentist?'],
    };
  }
  return null;
}

// ── Router ─────────────────────────────────────────────────────────────────

export function answerLocally(question: string, ctx: AssistantContext, topic?: Topic): Reply {
  const q = question.toLowerCase().replace(/[’']/g, "'").trim();
  const n = ctx.numbering;

  if (!q) return { text: 'Ask me anything about your teeth, your readings, or oral care in general.' };

  if (/trouble breathing|difficulty breathing|trouble swallowing/.test(q) || /swelling/.test(q) && /fever/.test(q)) return { text: 'Trouble breathing or swallowing, or facial swelling with fever, needs urgent medical care. Seek emergency help now; don’t wait for a scan.' };
  // Symptoms always come first.
  if (has(q, /\b(pain|hurts?|ache|aching|toothache|bleed|bleeding|swollen|swelling|abscess|broken|chipped|cracked|loose)\b/))
    return {
      text: 'I’m sorry you’re dealing with that. Pain, bleeding, swelling, or a broken or loose tooth should be checked by a dentist, whatever the readings say. The strip measures chemistry; it can’t rule a problem in or out. If it’s severe, getting worse, or you have a fever or facial swelling, contact a dentist or urgent care today.',
      suggestions: ['What should I tell my dentist?'],
    };

  if (has(q, /^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/))
    return { text: 'Hi! I can walk you through your latest readings, explain what a number means, or help with everyday questions like flossing, drinks or retainer care. What’s on your mind?', suggestions: ['How are my teeth overall?', 'What should I do this week?', 'What about coffee?'] };
  if (has(q, /^(thanks|thank you|thx|cheers|great|ok|okay|cool|got it)\b/)) return { text: pick(q, ['Anytime. Shout if anything else comes up.', 'Happy to help. Good luck with it this week.', 'You’re welcome!']) };
  if (has(q, /who are you|what can you do|help\b/))
    return { text: 'I’m your SPOT assistant. I read your latest scans and can explain them in plain language, show what’s changed, and suggest practical things to try. I can also answer general oral-health questions. I can’t diagnose anything; that’s your dentist’s job.', suggestions: ['How are my teeth overall?', 'Which teeth need attention?'] };

  if (has(q, /\bdentist\b/) && has(q, /tell|ask|mention|bring|prepare|visit/)) {
    const c = concerns(ctx).slice(0, 4);
    return {
      text: c.length
        ? `Good idea to go prepared. Things worth mentioning:\n${c.map((r) => `• ${where(r, n)}: ${BIOMARKERS[r.site.biomarker].shortName} ${value(r)} (${word(r)})${trendOf(ctx, r.site.id) ? `, ${trendSentence(r, ctx)!.replace(/^[^ ]+ there has /, '')}` : ''}`).join('\n')}\n\nYou could ask whether they’d like to check those areas more closely, and whether a higher-fluoride toothpaste would help.`
        : 'Nothing stands out right now, so just mention you’re monitoring with SPOT and everything has been in range.',
    };
  }

  if (has(q, /\b(strip|strips|replace|replacement|clarity|film|biofilm|fouling)\b/) && !has(q, /order|buy|deliver|subscription|ship|spare/)) {
    const lines = ctx.arches.map((a) => {
      const h = a.health;
      const eta = h.state === 'now' ? 'replace it now' : h.forecast ? `about ${plural(Math.max(1, Math.round(h.forecast.sessionsRemaining)), 'more session')}` : 'no forecast yet';
      return `• ${a.arch === 'upper' ? 'Upper' : 'Lower'} strip: ${h.clarity != null ? pct(h.clarity) : '—'} clear, ${eta}`;
    });
    return { text: `${lines.join('\n')}\n\nThe strip slowly picks up a thin film in your mouth. Reference spots with no chemistry on them tell us how much, so a dimmer reading means film on the strip, not a change in your teeth. Replacing on time keeps the numbers trustworthy.`, suggestions: ['Do I have spare strips?'] };
  }
  if (has(q, /order|buy|deliver|delivery|subscription|ship|spare|supply/))
    return { text: `You have ${plural(ctx.supply.upper, 'spare upper strip')} and ${plural(ctx.supply.lower, 'spare lower strip')}. Reordering is ${ctx.planMode === 'auto' ? 'automatic, so a new box ships when you run low' : 'manual'}. You can change that in the Strips tab.` };

  // Follow-ups that depend on the conversation.
  if (has(q, /^(why|how come)|why (is|are|does|do)|what causes|cause/)) return explain(ctx, topic);
  if (has(q, /chang|better|worse|improv|trend|over time|since|progress|history/)) return changes(ctx, topic);
  if (has(q, /what (should|can|do) i do|what to do|about it|fix|how (can|do) i (improve|help)|recommend|advice|tips?\b|this week|routine|plan/)) return plan(ctx);

  // A specific tooth?
  const t = findTooth(q, n);
  if (t) return tooth(ctx, t.universal);

  // General knowledge first, so "acidic drinks" isn't read as a pH-readings question.
  const g = general(q, ctx);
  if (g) return g;

  // A biomarker?
  const bio = BIO_WORDS.find(([re]) => re.test(q))?.[1];
  if (bio) return biomarker(ctx, bio);

  if (has(q, /which|where|worst|problem|attention|concern|flag/)) return attention(ctx);
  if (has(q, /overall|summary|how am i|how are my|how is my|health|doing|status|teeth\b/)) return overall(ctx, q);

  // Fallback: be useful anyway.
  const o = ctx.overview;
  return {
    text: `I’m not sure I caught that, but here’s something useful while you rephrase: ${o.overall != null ? `${Math.round(o.overall * 100)}% of your readings are in range` : 'your readings are loading'}, and ${concerns(ctx).length ? `the main thing to work on is cleaning between your back teeth` : 'nothing needs attention right now'}. You can ask about a specific tooth, any biomarker, or everyday topics like flossing, drinks or retainer care.`,
    suggestions: ['How are my teeth overall?', 'What should I do this week?', 'How do I floss properly?'],
  };
}

/** Pick up the topic from the latest user message that names a tooth or biomarker. */
export function topicFromHistory(history: { role: 'user' | 'assistant'; text: string }[], n: NumberingSystem): Topic | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role !== 'user') continue;
    const q = history[i].text.toLowerCase();
    const t = findTooth(q, n);
    const bio = BIO_WORDS.find(([re]) => re.test(q))?.[1];
    if (t || bio) return { tooth: t?.universal, bio };
  }
  return undefined;
}

/** Compact, de-identified summary sent to the optional server. */
export function contextSummary(ctx: AssistantContext) {
  return {
    overall_in_range: ctx.overview.overall,
    direction: ctx.overview.direction,
    by_arch: ctx.overview.byArch,
    biomarkers: ctx.overview.biomarkers.map((b) => ({ id: b.id, in_range: b.inRange, direction: b.direction, concerns: b.concerns })),
    sites_needing_attention: concerns(ctx, undefined, 1).slice(0, 12).map((r) => ({
      tooth: r.site.toothUniversal,
      tooth_name: toothByUniversal(r.site.toothUniversal).name,
      surface: r.site.surface,
      biomarker: r.site.biomarker,
      value: r.reading.value,
      unit: BIOMARKERS[r.site.biomarker].unit,
      status: r.status,
      two_week_change: trendOf(ctx, r.site.id) ?? null,
    })),
    findings: ctx.arches.flatMap((a) => a.insights.filter((i) => i.kind !== 'routine').map((i) => ({ arch: a.arch, title: i.title, recommended: i.recommended }))),
    strips: ctx.arches.map((a) => ({ arch: a.arch, state: a.health.state, clarity: a.health.clarity, sessions_left: a.health.forecast?.sessionsRemaining ?? null })),
    biomarker_list: BIOMARKER_ORDER,
  };
}

/** Only HTTPS endpoints are allowed, except plain HTTP to this device or a private LAN during development. */
export function chatUrlAllowed(raw: string, dev: boolean): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol === 'https:') return true;
  if (u.protocol !== 'http:' || !dev) return false;
  const h = u.hostname;
  return h === 'localhost' || h === '127.0.0.1' || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

export async function ask(question: string, history: { role: 'user' | 'assistant'; text: string }[], ctx: AssistantContext, topic?: Topic): Promise<Reply> {
  const q = question.slice(0, 1000);
  const url = process.env.EXPO_PUBLIC_CHAT_URL;
  const dev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  if (url && chatUrlAllowed(url, dev)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      // EXPO_PUBLIC_* values ship inside the app, so this token is an abuse speed-bump, not a secret.
      const token = process.env.EXPO_PUBLIC_CHAT_TOKEN;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          question: q,
          history: history.slice(-10).map((h) => ({ role: h.role, text: h.text.slice(0, 2000) })),
          context: contextSummary(ctx),
        }),
        signal: ctrl.signal,
      });
      if (res.status === 429) return { text: 'You’ve reached the live Ask limit. Please wait a little while before trying again.' };
      if (res.ok) {
        const data = (await res.json()) as unknown;
        const text = data && typeof data === 'object' ? (data as { reply?: unknown }).reply : undefined;
        if (typeof text === 'string' && text.trim()) return { text: text.slice(0, 4000) };
      }
    } catch {
      // Network error or timeout: fall back to the on-device assistant.
    } finally {
      clearTimeout(timer);
    }
  }
  return answerLocally(q, ctx, topic ?? topicFromHistory(history, ctx.numbering));
}
