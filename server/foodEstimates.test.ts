import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateFood } from '../src/domain/foodEstimates';
import { validFoodDetails } from '../src/domain/food';

test('typical food estimates distinguish sugar, acid and sticky texture', () => {
  const caramel = estimateFood('Caramel');
  assert.equal(caramel.sugar, 'yes');
  assert.equal(caramel.sticky, 'yes');
  const orange = estimateFood('Orange');
  assert.equal(orange.sugar, 'yes');
  assert.equal(orange.acidic, 'yes');
  assert.equal(estimateFood('Toast').sticky, 'yes');
  assert.equal(estimateFood('Salmon').sugar, 'no');
  assert.ok(validFoodDetails(caramel));
  assert.match(caramel.note, /Estimated.*not measured/);
});
test('missing recipe evidence and sugar-free claims do not become false certainty', () => {
  const unknown = estimateFood('Mixed meal');
  assert.equal(unknown.sugar, 'unknown');
  assert.equal(unknown.acidic, 'unknown');
  assert.equal(unknown.sticky, 'unknown');
  assert.equal(estimateFood('Coffee').sugar, 'unknown');
  assert.equal(estimateFood('Sugar-free sour candy').sugar, 'unknown');
  assert.equal(estimateFood('Sugar-free sour candy').acidic, 'yes');
});
