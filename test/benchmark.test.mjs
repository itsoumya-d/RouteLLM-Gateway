// SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBenchmark } from '../src/benchmark.js';

test('router meets retention and cost targets on the synthetic benchmark', async () => {
  const result = await runBenchmark();
  assert.equal(result.test_cases, 250);
  assert.ok(result.retention >= 0.98, `retention ${result.retention}`);
  assert.ok(result.cost_reduction >= 0.65, `cost reduction ${result.cost_reduction}`);
  assert.ok(result.systems.router_plus_cache.accuracy >= 0.96);
  assert.ok(result.systems.router_plus_cache.cache_hit_rate > 0);
});
