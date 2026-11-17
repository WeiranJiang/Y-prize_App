import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMPTY_FOOD, validFoodEntry, validFoodDetails } from '../src/domain/food.js';
import { foodFromLabel } from '../src/domain/labelFood.js';

test('food entries require a name, a bounded duration and valid signals', () => {
  const entry = { ...EMPTY_FOOD, id: 'one', at: '2026-11-15T12:00:00Z', name: 'Coffee', durationMinutes: 30, durationAtLeast: false, source: 'manual' };
  assert.ok(validFoodEntry(entry));
  for (const patch of [{ name: ' ' }, { durationMinutes: 0 }, { durationMinutes: 721 }, { durationMinutes: 1.2 }, { sugar: 'safe' }, { at: 'bad-date' }, { source: 'unknown' }, { note: 'a'.repeat(241) }]) assert.equal(validFoodEntry({ ...entry, ...patch }), false);
  assert.equal(validFoodDetails(null), false);
});
test('label reader distinguishes total from added sugar and preserves missing evidence', () => {
  const sugary = foodFromLabel('Fruit yogurt\nNutrition Facts\nTotal Sugars 18g\nIncludes 0g Added Sugars\nIngredients: milk, fruit');
  assert.equal(sugary?.sugar, 'yes');
  assert.equal(sugary?.acidic, 'unknown');
  assert.equal(sugary?.sticky, 'unknown');
  const missing = foodFromLabel('Nutrition Facts\nIncludes 0g Added Sugars\nProtein 4g');
  assert.equal(missing?.sugar, 'unknown');
  const zero = foodFromLabel('Sparkling water\nNutrition Facts\nTotal Sugars 0g\nIngredients: water, citric acid');
  assert.equal(zero?.sugar, 'no');
  assert.equal(zero?.acidic, 'yes');
  assert.equal(foodFromLabel('a photograph of a table'), null);
  assert.equal(foodFromLabel('Ingredients: sugar, flour, salt')?.sugar, 'yes');
});

test('food photo previews accept only bounded embedded JPEGs and old entries still load', () => {
  const entry = { ...EMPTY_FOOD, id: 'photo', at: '2026-11-15T12:00:00Z', name: 'Toast', durationMinutes: 15, durationAtLeast: false, source: 'meal' };
  assert.ok(validFoodEntry(entry));
  assert.ok(validFoodEntry({ ...entry, photo: 'data:image/jpeg;base64,/9j/AA==' }));
  for (const photo of ['https://example.com/track.jpg', 'blob:temporary', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,' + 'A'.repeat(250000)]) {
    assert.equal(validFoodEntry({ ...entry, photo }), false);
  }
});
