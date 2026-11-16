import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDemoHistory } from '../src/domain/demo';
import { attentionSites, attentionLevel } from '../src/domain/attention';

test('review shading requires a reported measurement and follows the selected biomarker', () => {
  const demo = buildDemoHistory(new Date());
  const strip = demo.strips.find(s => !s.retiredAt)!;
  const scan = structuredClone(demo.scans.find(s => s.stripId === strip.id)!);
  const site = strip.sites.find(s => s.biomarker === 'pH' && s.role === 'measure')!;
  const reading = scan.readings.find(r => r.siteId === site.id)!;
  reading.value = 4;
  assert.ok(attentionSites(scan, strip).some(s => s.id === site.id));
  assert.ok(!attentionSites(scan, strip, 'calcium').some(s => s.id === site.id));
  assert.equal(attentionLevel(scan, site), 'attention');
  reading.value = 5.7;
  assert.ok(attentionSites(scan, strip).some(s => s.id === site.id));
  assert.equal(attentionLevel(scan, site), 'watch');
  reading.value = null;
  assert.ok(!attentionSites(scan, strip).some(s => s.id === site.id));
  reading.value = 7;
  assert.ok(!attentionSites(scan, strip).some(s => s.id === site.id));
  assert.deepEqual(attentionSites(undefined, strip), []);
  assert.ok(attentionSites(scan, strip).every(s => s.biomarker !== 'aMMP8'));
});
