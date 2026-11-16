import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerLocally, contextSummary, topicFromHistory, type AssistantContext } from '../src/domain/assistant.js';
import { buildDemoHistory, DEFAULT_LIMITS } from '../src/domain/demo.js';
import { buildOverview } from '../src/domain/overview.js';
import { buildInsights } from '../src/domain/insights.js';
import { computeStripHealth } from '../src/domain/fouling.js';

function fixture(): AssistantContext {
  const demo = buildDemoHistory(new Date());
  const arches = (['upper', 'lower'] as const).map(arch => {
    const strip = demo.strips.find(strip => strip.arch === arch && !strip.retiredAt)!;
    const scans = demo.scans.filter(scan => demo.strips.find(strip => strip.id === scan.stripId)?.arch === arch);
    const latest = scans.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0];
    const health = computeStripHealth(strip, demo.scans, DEFAULT_LIMITS);
    return { arch, ...buildInsights(latest, strip, scans, health, 'universal'), health };
  });
  return { arches, overview: buildOverview(demo.scans, demo.strips), numbering: 'universal', supply: { upper: 1, lower: 2 }, planMode: 'manual' };
}
const ctx = fixture();

test('aMMP-8 questions are not interpreted as tooth 8 or a calibrated result', () => {
  for (const question of ['What is aMMP-8?', 'What does aMMP-8 mean?', 'Why is my aMMP-8 high?']) {
    const reply = answerLocally(question, ctx);
    assert.equal(reply.topic?.bio, 'aMMP8');
    assert.equal(reply.topic?.tooth, undefined);
    assert.match(reply.text, /calibrat/i);
    assert.doesNotMatch(reply.text, /everything.*in range/i);
  }
  assert.deepEqual(topicFromHistory([{ role: 'user', text: 'Tell me about aMMP-8' }], 'universal'), { tooth: undefined, bio: 'aMMP8' });
});
test('an explicit tooth with aMMP-8 stays focused on its uncalibrated locations', () => {
  const reply = answerLocally('Tell me about aMMP-8 on tooth #3', ctx);
  assert.equal(reply.topic?.tooth, 3);
  assert.equal(reply.topic?.bio, 'aMMP8');
  assert.match(reply.text, /not calibrated|no calibrated/i);
  assert.doesNotMatch(reply.text, /available readings are in range/i);
});
test('numbers in measured values are not mistaken for tooth numbers', () => {
  assert.equal(answerLocally('What does pH 6.5 mean?', ctx).topic?.bio, 'pH');
  assert.equal(answerLocally('Tell me about tooth #3', ctx).topic?.tooth, 3);
});
test('uncalibrated channels do not receive a consistency assessment', () => {
  assert.equal(ctx.overview.biomarkers.find(bio => bio.id === 'aMMP8')?.consistent, false);
});

test('full mapped context and newest conversation fit the backend byte limit', async () => {
  const { chatRequestBody, utf8Bytes } = await import('../src/domain/chatPayload.js');
  const { validateInput, LIMITS } = await import('./security.js');
  const history = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, text: `Turn ${index}: ` + '🦷'.repeat(1000) }));
  const body = chatRequestBody('Explain the sensors at 4/3', history, contextSummary(ctx));
  assert.ok(Buffer.byteLength(body, 'utf8') <= LIMITS.body);
  assert.equal(utf8Bytes(body), Buffer.byteLength(body, 'utf8'));
  const input = validateInput(JSON.parse(body));
  assert.equal(input.question, 'Explain the sensors at 4/3');
  assert.equal((input.context.mapped_sites as { rows: unknown[] }).rows.length, 158);
  assert.match(input.history.at(-1)!.text, /^Turn 9:/);
  assert.ok(input.history.length < history.length);
  assert.throws(() => chatRequestBody('hello', [], { text: 'x'.repeat(31000) }));
});
test('calibration drift uses each channel’s unit instead of always saying pH', () => {
  const snapshot = ctx.arches[0];
  const scan = snapshot.analysis!.scan;
  const adjusted = { ...scan, readings: scan.readings.map(reading => reading.biomarker === 'calcium' ? { ...reading, calibration: 'recalibrate' as const, value: 1.2, drift: 0.3 } : reading) };
  const insights = buildInsights(adjusted, snapshot.analysis!.strip, [adjusted], null, 'universal').insights;
  const drift = insights.find(insight => insight.id === 'R6')!;
  assert.ok(drift);
  assert.match(drift.observed, /mM/);
  assert.doesNotMatch(drift.observed, /pH/);
});
