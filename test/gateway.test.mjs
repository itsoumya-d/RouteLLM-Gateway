// SPDX-License-Identifier: MIT
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BradleyTerryRouter, featurize } from '../src/router.js';
import { SemanticCache } from '../src/cache.js';
import { ScriptedProvider } from '../src/providers.js';
import { createGateway } from '../src/gateway.js';

function fixture({ weakText = 'weak answer', strongText = 'strong answer', threshold = 0.5 } = {}) {
  const router = new BradleyTerryRouter(new Array(featurize('x').length).fill(0));
  const weak = new ScriptedProvider('fast', weakText, { cost: 0.0002 });
  const strong = new ScriptedProvider('frontier', strongText, { cost: 0.002 });
  const cache = new SemanticCache({ threshold: 0.94 });
  const gateway = createGateway({ router, cache, providers: { fast: weak, frontier: strong }, threshold });
  return { gateway, weak, strong, cache };
}

describe('routing gateway', () => {
  test('routes at threshold and caches the response', async () => {
    const { gateway, weak, strong } = fixture({ threshold: 0.5 });
    const request = { messages: [{ role: 'user', content: 'What is 2 + 2?' }] };
    const first = await gateway.handle(request);
    assert.equal(first.model, 'frontier');
    assert.equal(strong.calls, 1);
    const second = await gateway.handle(request);
    assert.equal(second.cached, true);
    assert.equal(strong.calls, 1);
    assert.equal(weak.calls, 0);
  });

  test('falls back to the strong model on schema failure', async () => {
    const { gateway, strong } = fixture({ weakText: 'not json', strongText: '{"answer":"ok","confidence":0.9}', threshold: 1 });
    const response = await gateway.handle({
      messages: [{ role: 'user', content: 'Return JSON' }],
      response_format: { json_schema: { schema: { type: 'object', required: ['answer', 'confidence'] } } },
    });
    assert.equal(response.model, 'frontier');
    assert.equal(response.fallback, true);
    assert.equal(strong.calls, 1);
    assert.equal(response.choices[0].message.content, '{"answer":"ok","confidence":0.9}');
  });

  test('streams deltas and a final metadata chunk', async () => {
    const { gateway } = fixture();
    const chunks = [];
    for await (const chunk of gateway.stream({ messages: [{ role: 'user', content: 'hello' }] })) chunks.push(chunk);
    assert.ok(chunks.some((chunk) => chunk.type === 'delta'));
    assert.equal(chunks.at(-1).type, 'done');
    assert.equal(chunks.at(-1).response.model, 'frontier');
  });
});
