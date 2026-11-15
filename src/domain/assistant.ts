/**
 * SPOT assistant. Answers questions about the user's own readings with short,
 * grounded replies built from the same data and rules the app shows.
 * It never diagnoses, and it points to a dentist for symptoms.
 *
 * By default it runs on-device (works offline, demo data). If
 * EXPO_PUBLIC_CHAT_URL is set, questions are sent with a compact summary of
 * the user's data to a server (see /server) that answers with Claude.
 */
import { siteTitle } from './analysis';
import { BIOMARKER_ORDER, BIOMARKERS, BiomarkerId, formatValue, STATUS_RANK, unitSuffix } from './biomarkers';
import type { StripHealth } from './fouling';
import { pct } from './fouling';
import { COPY, Insight, Recommendation } from './insights';
import type { ScanAnalysis } from './analysis';
import type { Overview } from './overview';
import { Arch, NumberingSystem, searchTeeth, toothNumber } from './teeth';

export interface ArchSnapshot {
  arch: Arch;
  analysis?: ScanAnalysis;
  insights: Insight[];
  recommendations: Recommendation[];
  health: StripHealth;
}

export interface AssistantContext {
  arches: ArchSnapshot[];
  overview: Overview;
  numbering: NumberingSystem;
  supply: Record<Arch, number>;
  planMode: 'auto' | 'manual';
}

export interface Reply {
  text: string;
  suggestions?: string[];
}

const SUGGEST = ['How are my teeth overall?', 'What should I do this week?', 'Tell me about tooth #3', 'When should I replace my strips?'];

const BIO_WORDS: [RegExp, BiomarkerId][] = [
  [/\b(ph|acid|acidic|acidity)\b/, 'pH'],
  [/\b(lactate|lactic|sugar|sugars|snack)/, 'lactate'],
  [/\bcalcium\b/, 'calcium'],
  [/\bphosphate\b/, 'phosphate'],
  [/\bfluorid/, 'fluoride'],
  [/\bammoni/, 'ammonium'],
];

const archName = (a: Arch) => (a === 'upper' ? 'upper' : 'lower');

function concerns(ctx: AssistantContext, bio?: BiomarkerId) {
  return ctx.arches.flatMap((a) =>
    (a.analysis?.results ?? []).filter((r) => STATUS_RANK[r.status] >= 2 && (!bio || r.site.biomarker === bio)),
  );
}

function describeSite(r: NonNullable<ArchSnapshot['analysis']>['results'][number], n: NumberingSystem) {
  const b = BIOMARKERS[r.site.biomarker];
  const t = siteTitle(r.site, n);
  const word = r.status === 'normal' ? 'in range' : r.status === 'unavailable' ? 'not measured' : b.statusWords[r.status].toLowerCase();
  const v = r.reading.value == null ? '' : ` ${formatValue(b, r.reading.value)}${unitSuffix(b)}`;
  return `${b.shortName}${v} at ${t.number} ${t.surface.toLowerCase()} (${word})`;
}

export function answerLocally(question: string, ctx: AssistantContext): Reply {
  const q = question.toLowerCase().trim();
  const n = ctx.numbering;

  // Symptoms always come first.
  if (/\b(pain|hurt|hurts|ache|bleed|bleeding|swollen|swelling|sensitive|sensitivity|broken|chipped)\b/.test(q)) {
    return {
      text: 'Pain, bleeding, swelling or new sensitivity are worth a dentist visit, whatever the readings say. The strip measures local chemistry; it can’t rule a problem in or out. If it’s severe or sudden, contact a dentist promptly.',
      suggestions: ['What should I tell my dentist?', 'How are my teeth overall?'],
    };
  }

  if (/\b(cavity|cavities|decay|caries|gum disease|gingivitis|diagnos)/.test(q)) {
    const c = concerns(ctx, 'pH');
    return {
      text: `I can’t diagnose cavities or gum disease. These readings are research indicators. What I can say: ${c.length ? `${c.length} site${c.length > 1 ? 's' : ''} read more acidic than the configured range at your last scan, which is worth keeping clean and mentioning to your dentist.` : 'no site is currently below the acidity threshold.'}`,
      suggestions: ['Which teeth need attention?', 'What should I tell my dentist?'],
    };
  }

  if (/\bdentist\b/.test(q)) {
    const rec = concerns(ctx).slice(0, 3).map((r) => `• ${describeSite(r, n)}`);
    return {
      text: rec.length
        ? `Things worth mentioning at your next visit:\n${rec.join('\n')}\nYou can show them the Trends tab for how these changed over time.`
        : 'Nothing stands out right now. Keep your regular check-ups.',
    };
  }

  if (/\b(strip|strips|replace|replacement|clarity|film|biofilm|fouling)\b/.test(q) && !/\b(order|buy|deliver|subscription|ship)/.test(q)) {
    const lines = ctx.arches.map((a) => {
      const h = a.health;
      const eta = h.state === 'now' ? 'replace now' : h.forecast ? `about ${Math.max(1, Math.round(h.forecast.sessionsRemaining))} more sessions` : 'no forecast yet';
      return `• ${archName(a.arch)} strip: clarity ${h.clarity != null ? pct(h.clarity) : '—'}, ${eta}`;
    });
    return {
      text: `${lines.join('\n')}\nClarity comes from inert reference spots. When they dim, it’s film on the strip, not a change in your mouth.`,
      suggestions: ['Do I have spare strips?'],
    };
  }

  if (/\b(order|buy|deliver|delivery|subscription|ship|spare|supply)\b/.test(q)) {
    return {
      text: `You have ${ctx.supply.upper} spare upper and ${ctx.supply.lower} spare lower strip${ctx.supply.lower === 1 ? '' : 's'}. Reordering is ${ctx.planMode === 'auto' ? 'automatic' : 'manual'}. You can change that in the Strips tab.`,
    };
  }

  // A specific tooth?
  const numMatch = q.match(/#?\b(\d{1,2})\b/);
  let teeth = numMatch ? searchTeeth(numMatch[1], n) : [];
  if (!teeth.length && /\b(upper|lower)\b.*\b(incisor|canine|premolar|molar)\b/.test(q)) teeth = searchTeeth(q.replace(/[^a-z0-9 ]/g, ''), n);
  if (teeth.length) {
    const t = teeth[0];
    const snap = ctx.arches.find((a) => a.arch === t.arch);
    const rows = (snap?.analysis?.results ?? []).filter((r) => r.site.toothUniversal === t.universal);
    if (!rows.length) return { text: `${t.name} (${toothNumber(t, n)}) has no sensor, so I don’t have readings for it. Nearby readings aren’t estimated.` };
    const worst = rows.sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]);
    const bad = worst.filter((r) => STATUS_RANK[r.status] >= 1);
    const tip = bad.length ? ` ${COPY[bad[0].site.biomarker].advice(bad[0].site.surface === 'mesial' || bad[0].site.surface === 'distal')}` : ' Everything here is in range.';
    return {
      text: `${t.name} (${toothNumber(t, n)}):\n${worst.slice(0, 5).map((r) => `• ${describeSite(r, n)}`).join('\n')}\n${tip.trim()}`,
      suggestions: ['How has it changed?', 'What should I do this week?'],
    };
  }

  // A biomarker?
  const bio = BIO_WORDS.find(([re]) => re.test(q))?.[1];
  if (bio) {
    const b = BIOMARKERS[bio];
    const sum = ctx.overview.biomarkers.find((x) => x.id === bio);
    const c = concerns(ctx, bio);
    const trend = sum?.direction === 'improving' ? 'improving' : sum?.direction === 'worsening' ? 'trending the wrong way' : 'steady';
    return {
      text: `${b.shortName}: ${sum?.inRange != null ? `${Math.round(sum.inRange * 100)}% of readings in range` : 'no recent readings'}, ${trend}.${c.length ? `\nNeeds attention: ${c.slice(0, 3).map((r) => describeSite(r, n)).join('; ')}.` : ''}\n${COPY[bio].advice(c.some((r) => r.site.surface === 'mesial' || r.site.surface === 'distal'))}`,
      suggestions: ['Which teeth need attention?', 'How are my teeth overall?'],
    };
  }

  if (/\b(recommend|advice|tip|tips|should i|what can i|improve|help my|routine|this week)\b/.test(q)) {
    const recs = ctx.arches.flatMap((a) => a.recommendations).filter((r, i, arr) => arr.findIndex((x) => x.text === r.text) === i).slice(0, 4);
    return {
      text: recs.length ? recs.map((r) => `• ${r.text}`).join('\n') : 'Keep brushing twice daily with fluoride toothpaste and cleaning between your teeth.',
      suggestions: ['Why these?', 'Which teeth need attention?'],
    };
  }

  if (/\b(which|where).*(teeth|tooth|areas?|sites?)|attention|worst|problem/.test(q) || /\bwhy\b/.test(q)) {
    const c = concerns(ctx).sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]).slice(0, 5);
    return {
      text: c.length ? `These need attention at your last scan:\n${c.map((r) => `• ${describeSite(r, n)}`).join('\n')}` : 'No site is past a concern threshold right now.',
      suggestions: c.length ? [`Tell me about tooth #${c[0].site.toothUniversal}`] : undefined,
    };
  }

  if (/\b(overall|summary|how am i|how are my|how is my|health|doing|status)\b/.test(q) || q.length < 3) {
    const o = ctx.overview;
    const c = concerns(ctx);
    const dir = o.direction === 'improving' ? 'improving' : o.direction === 'worsening' ? 'slipping a little' : 'steady';
    return {
      text: `${o.overall != null ? `${Math.round(o.overall * 100)}%` : '—'} of your readings are in range, and that’s ${dir}. Upper ${o.byArch.upper != null ? `${Math.round(o.byArch.upper * 100)}%` : '—'}, lower ${o.byArch.lower != null ? `${Math.round(o.byArch.lower * 100)}%` : '—'}.${c.length ? ` ${c.length} site${c.length > 1 ? 's' : ''} need attention.` : ''}`,
      suggestions: ['Which teeth need attention?', 'What should I do this week?'],
    };
  }

  if (/^(hi|hey|hello|yo)\b/.test(q) || /\bwhat can you\b/.test(q)) {
    return { text: 'Hi! Ask me about your teeth, a specific tooth, any biomarker (pH, lactate, calcium, phosphate, fluoride, ammonium) or your strips.', suggestions: SUGGEST };
  }

  return {
    text: 'I can answer questions about your readings, a specific tooth, any of the six biomarkers, recommendations, and your strips.',
    suggestions: SUGGEST,
  };
}

/** Compact, de-identified summary sent to the optional server. */
export function contextSummary(ctx: AssistantContext) {
  return {
    overall_in_range: ctx.overview.overall,
    direction: ctx.overview.direction,
    by_arch: ctx.overview.byArch,
    biomarkers: ctx.overview.biomarkers.map((b) => ({ id: b.id, in_range: b.inRange, direction: b.direction, concerns: b.concerns })),
    findings: ctx.arches.flatMap((a) => a.insights.filter((i) => i.kind !== 'routine').map((i) => ({ arch: a.arch, title: i.title, observed: i.observed, recommended: i.recommended }))),
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

export async function ask(question: string, history: { role: 'user' | 'assistant'; text: string }[], ctx: AssistantContext): Promise<Reply> {
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
  return answerLocally(q, ctx);
}
