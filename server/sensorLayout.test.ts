import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SENSOR_SITES, SENSOR_REFERENCES, sitesForArch, referencesForArch, siteOnTooth, siteTeeth, surfaceOnTooth } from '../src/domain/sensorLayout.js';
import { sensorAnchor, configuredSensorRegions } from '../src/domain/sensorGeometry.js';
import { frameFor } from '../src/domain/arch.js';
import { toothByUniversal } from '../src/domain/teeth.js';
import { BIOMARKERS, BIOMARKER_ORDER, BIOMARKER_COLORS, classify } from '../src/domain/biomarkers.js';
import { buildDemoHistory } from '../src/domain/demo.js';
import { analyzeScan, siteTitle } from '../src/domain/analysis.js';
import { usableFractionOf } from '../src/domain/fouling.js';

const pair = (first: number, second: number) => [first, second].sort((a, b) => a - b).join('/');
const contacts = (biomarker: string) => SENSOR_SITES.filter(site => site.biomarker === biomarker && site.contactWith != null).map(site => pair(site.toothUniversal, site.contactWith!)).sort();

test('physical totals and arch distribution match the supplied five-biomarker layout', () => {
  assert.deepEqual(BIOMARKER_ORDER, ['ammonium', 'pH', 'calcium', 'fluoride', 'aMMP8']);
  assert.deepEqual(Object.fromEntries(BIOMARKER_ORDER.map(id => [id, SENSOR_SITES.filter(site => site.biomarker === id).length])), { ammonium: 8, pH: 6, calcium: 16, fluoride: 112, aMMP8: 16 });
  assert.equal(SENSOR_SITES.length + SENSOR_REFERENCES.length, 162);
  assert.equal(sitesForArch('upper').length, 78);
  assert.equal(sitesForArch('lower').length, 80);
  assert.equal(referencesForArch('upper').length, 2);
  assert.equal(referencesForArch('lower').length, 2);
  assert.equal(sitesForArch('upper').filter(site => site.biomarker === 'calcium').length, 6);
  assert.equal(sitesForArch('lower').filter(site => site.biomarker === 'calcium').length, 10);
  assert.equal(new Set([...SENSOR_SITES, ...SENSOR_REFERENCES].map(site => site.id)).size, 162);
  for (const site of SENSOR_SITES) {
    assert.equal(site.transmitters.length, 1);
    for (const tooth of siteTeeth(site)) assert.ok(![1, 16, 17, 32].includes(tooth));
    if (site.contactWith) assert.equal(toothByUniversal(site.toothUniversal).arch, toothByUniversal(site.contactWith).arch);
  }
});
test('all 28 teeth have exactly the four specified mid-crown fluoride corners', () => {
  for (const tooth of [...Array.from({ length: 14 }, (_, i) => i + 2), ...Array.from({ length: 14 }, (_, i) => i + 18)]) {
    const corners = SENSOR_SITES.filter(site => site.biomarker === 'fluoride' && site.toothUniversal === tooth);
    assert.deepEqual(corners.map(site => `${site.corner}-${site.face}`).sort(), ['distal-buccal', 'distal-lingual', 'mesial-buccal', 'mesial-lingual']);
    assert.ok(corners.every(site => site.height === 'mid-crown'));
  }
});
test('contact pairs and surface/half locations exactly match the placement tables', () => {
  assert.deepEqual(contacts('ammonium'), [[8,9],[3,2],[14,15],[30,31],[19,18]].map(([a,b])=>pair(a,b)).sort());
  assert.deepEqual(contacts('calcium'), [[5,4],[4,3],[12,13],[13,14],[28,29],[29,30],[21,20],[20,19]].map(([a,b])=>pair(a,b)).sort());
  assert.deepEqual(contacts('aMMP8'), [[8,7],[6,5],[4,3],[3,2],[9,10],[11,12],[13,14],[14,15],[24,23],[22,21],[20,19],[19,18],[25,26],[27,28],[29,30],[30,31]].map(([a,b])=>pair(a,b)).sort());
  assert.deepEqual(contacts('pH'), ['3/4']);
  assert.deepEqual(SENSOR_SITES.filter(site=>site.biomarker==='pH' && !site.contactWith).map(site=>`${site.toothUniversal}:${site.face}:${site.half ?? 'whole'}`).sort(), ['8:lingual:whole','9:buccal:whole','3:lingual:mesial','19:buccal:mesial','27:lingual:whole'].sort());
  assert.deepEqual(SENSOR_SITES.filter(site=>site.biomarker==='calcium' && !site.contactWith && !site.half).map(site=>site.toothUniversal).sort((a,b)=>a-b), [23,24,25,26]);
  assert.deepEqual(SENSOR_SITES.filter(site=>site.biomarker==='calcium' && site.half==='distal').map(site=>site.toothUniversal).sort((a,b)=>a-b), [3,14,19,30]);
  assert.deepEqual(SENSOR_SITES.filter(site=>site.biomarker==='ammonium' && !site.contactWith).map(site=>site.toothUniversal), [10,24,25]);
});
test('shared contacts belong to both teeth once, with correct relative surfaces and labels', () => {
  const shared = SENSOR_SITES.find(site => site.biomarker === 'pH' && site.contactWith === 3)!;
  assert.ok(siteOnTooth(shared, 3)); assert.ok(siteOnTooth(shared, 4)); assert.ok(!siteOnTooth(shared, 5));
  assert.equal(surfaceOnTooth(shared, 3), 'mesial');
  assert.equal(surfaceOnTooth(shared, 4), 'distal');
  assert.match(siteTitle(shared).surface, /Palatal contact/);
  assert.match(siteTitle(shared).number, /4.*3/);
  assert.equal(SENSOR_SITES.filter(site=>site.id===shared.id).length, 1);
});
test('anchors stay on the specified face and gum margin; references have distinct purposes', () => {
  for (const site of [...SENSOR_SITES, ...SENSOR_REFERENCES]) {
    const anchor = sensorAnchor(site);
    assert.ok(anchor.p.every(Number.isFinite));
    assert.ok(anchor.p[1] > 0, `${site.id} must not be under the gum`);
    if (site.height === 'gingival-margin') { assert.equal(anchor.p[1], 0.35); assert.equal(site.face, 'lingual'); }
    if (!('contactWith' in site) || site.contactWith == null) {
      const f=frameFor(site.toothUniversal)!;
      const normalDot=anchor.n[0]*f.normal[0]+anchor.n[2]*f.normal[2];
      assert.ok(site.face === 'buccal' ? normalDot > 0.9 : normalDot < -0.9);
    }
  }
  assert.deepEqual(SENSOR_REFERENCES.map(ref=>`${ref.purpose}:${ref.toothUniversal}`).sort(), ['potassium-compensation:6','potassium-compensation:27','ammp8-background:15','ammp8-background:18'].sort());
  assert.ok(SENSOR_SITES.filter(site=>site.biomarker==='aMMP8').every(site=>site.height==='gingival-margin' && site.face==='lingual'));
});
test('aMMP-8 has no fabricated readings/thresholds and does not count as optical signal failure', () => {
  const demo=buildDemoHistory(new Date('2026-11-16T20:00:00Z'));
  for (const strip of demo.strips) {
    const scan=demo.scans.find(scan=>scan.stripId===strip.id)!;
    assert.ok(scan.readings.filter(reading=>reading.biomarker==='aMMP8').every(reading=>reading.value===null));
    assert.equal(classify(30, BIOMARKERS.aMMP8.bands), 'unavailable');
    const analysis=analyzeScan(scan,strip,demo.scans);
    assert.ok(analysis.withheld.every(result=>result.site.biomarker!=='aMMP8'));
    const withoutM={...scan,readings:scan.readings.filter(reading=>reading.biomarker!=='aMMP8')};
    assert.equal(usableFractionOf(scan), usableFractionOf(withoutM));
    const map=configuredSensorRegions(strip,'overview');
    assert.equal(map.length, strip.sites.length+2);
    assert.equal(map.filter(region=>region.intensity===0).length,2);
    for (const site of strip.sites) assert.equal(map.find(region=>region.id===site.id)?.color, BIOMARKER_COLORS[site.biomarker]);
  }
});

test('standard chart orientation keeps the patient’s right at negative x', () => {
  for (const tooth of [...new Set(SENSOR_SITES.flatMap(siteTeeth))]) {
    const frame = frameFor(tooth)!;
    assert.ok(frame.tooth.side === 'right' ? frame.center[0] < 0 : frame.center[0] > 0);
  }
});
