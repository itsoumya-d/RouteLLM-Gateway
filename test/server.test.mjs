// SPDX-License-Identifier: MIT
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BradleyTerryRouter, featurize } from '../src/router.js';
import { SemanticCache } from '../src/cache.js';
import { ScriptedProvider } from '../src/providers.js';
import { createGateway } from '../src/gateway.js';
import { startGateway } from '../src/server.js';

async function fixture() {
  const router = new BradleyTerryRouter(new Array(featurize('x').length).fill(0));
  const gateway = createGateway({
    router,
    cache: new SemanticCache({ threshold: 0.94 }),
    providers: {
      fast: new ScriptedProvider('fast', 'fast answer', { cost: 0.0002 }),
      frontier: new ScriptedProvider('frontier', 'strong answer', { cost: 0.002 }),
    },
    threshold: 0.5,
  });
  const server = await startGateway({ gateway, port: 0 });
  return { server, gateway };
}

describe('HTTP surface', () => {
  test('health, chat, streaming, and Anthropic-compatible response', async (t) => {
    const { server } = await fixture();
    t.after(() => server.close());

    const health = await fetch(`${server.url}/health`).then((res) => res.json());
    assert.equal(health.ok, true);

    const chat = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    }).then((res) => res.json());
    assert.equal(chat.choices[0].message.content, 'strong answer');

    const stream = await fetch(`${server.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'hello again' }] }),
    }).then((res) => res.text());
    assert.match(stream, /data: \[DONE\]/);
    assert.match(stream, /strong answer/);

    const anthropic = await fetch(`${server.url}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hello' }] }),
    }).then((res) => res.json());
    assert.equal(anthropic.content[0].text, 'strong answer');
  });
});
