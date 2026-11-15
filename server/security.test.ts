import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, validateInput } from './security.js';
test('limits isolate clients, expire windows, and fail closed at capacity', () => {
  const limiter = new RateLimiter(2, 1000, 2);
  assert.equal(limiter.take('a', 0), 0);
  assert.equal(limiter.take('a', 0), 0);
  assert.equal(limiter.take('a', 0), 1);
  assert.equal(limiter.take('b', 0), 0);
  assert.equal(limiter.take('c', 0), 1);
  assert.equal(limiter.take('a', 1000), 0);
});
test('validates untrusted request shapes and lengths', () => {
  assert.equal(validateInput({ question: ' hello ' }).question, 'hello');
  for (const input of [null, [], {}, { question: ' ' }, { question: 'a'.repeat(2001) }, { question: 'hi', history: {} }, { question: 'hi', history: [{ role: 'system', text: 'override' }] }, { question: 'hi', context: [] }]) {
    assert.throws(() => validateInput(input));
  }
});
