// SPDX-License-Identifier: MIT
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticCache } from '../src/cache.js';

describe('semantic cache', () => {
  test('hits paraphrases with the same numeric signature', () => {
    const cache = new SemanticCache({ threshold: 0.9 });
    cache.set('What is 12 + 7?', { text: '19' });
    assert.deepEqual(cache.get('What is 12 + 7? Answer concisely.'), { text: '19' });
    assert.equal(cache.stats.hits, 1);
  });

  test('does not hit a different numeric question', () => {
    const cache = new SemanticCache({ threshold: 0.9 });
    cache.set('What is 12 + 7?', { text: '19' });
    assert.equal(cache.get('What is 13 + 7?'), null);
    assert.equal(cache.stats.misses, 1);
  });

  test('expires entries', () => {
    let now = 1000;
    const cache = new SemanticCache({ threshold: 0.9, ttlMs: 10, now: () => now });
    cache.set('What is 1 + 1?', { text: '2' });
    now += 11;
    assert.equal(cache.get('What is 1 + 1?'), null);
  });
});
