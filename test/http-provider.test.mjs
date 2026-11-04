// SPDX-License-Identifier: MIT
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { BradleyTerryRouter, featurize } from "../src/router.js";
import { SemanticCache } from "../src/cache.js";
import { HttpProvider } from "../src/providers.js";
import { createGateway } from "../src/gateway.js";

async function fakeServer(handler) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/v1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function jsonResponse(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

describe("HTTP provider", () => {
  test("parses an OpenAI-compatible response and forwards auth/model", async (t) => {
    let seen = null;
    const server = await fakeServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        seen = { auth: req.headers.authorization, body: JSON.parse(raw) };
        jsonResponse(res, 200, {
          choices: [{ message: { content: "hello from HTTP" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        });
      });
    });
    t.after(server.close);

    const provider = new HttpProvider({
      name: "fake-openai",
      baseUrl: server.url,
      apiKey: "test-key",
      model: "test-model",
      costPerRequest: 0.001,
    });
    const result = await provider.complete({ prompt: "hi" });
    assert.equal(result.text, "hello from HTTP");
    assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 2 });
    assert.equal(result.cost, 0.001);
    assert.ok(result.latencyMs >= 0);
    assert.equal(seen.auth, "Bearer test-key");
    assert.equal(seen.body.model, "test-model");
    assert.equal(seen.body.messages[0].content, "hi");
  });

  test("surfaces non-2xx responses with the status code", async (t) => {
    const server = await fakeServer((req, res) => {
      res.writeHead(429, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "rate limited" }));
    });
    t.after(server.close);
    const provider = new HttpProvider({ baseUrl: server.url, model: "test-model" });
    await assert.rejects(provider.complete({ prompt: "hi" }), /429/);
  });

  test("rejects a response without text content", async (t) => {
    const server = await fakeServer((req, res) => jsonResponse(res, 200, { choices: [] }));
    t.after(server.close);
    const provider = new HttpProvider({ baseUrl: server.url, model: "test-model" });
    await assert.rejects(provider.complete({ prompt: "hi" }), /no text content/);
  });

  test("plugs into the routing gateway", async (t) => {
    const server = await fakeServer((req, res) => {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        const body = JSON.parse(raw);
        jsonResponse(res, 200, {
          choices: [{ message: { content: `answer from ${body.model}` } }],
          usage: { prompt_tokens: 4, completion_tokens: 3 },
        });
      });
    });
    t.after(server.close);

    const router = new BradleyTerryRouter(new Array(featurize("x").length).fill(0));
    const cache = new SemanticCache({ threshold: 0.94 });
    const gateway = createGateway({
      router,
      cache,
      providers: {
        fast: new HttpProvider({ name: "fast", baseUrl: server.url, model: "weak-model", costPerRequest: 0.0002 }),
        frontier: new HttpProvider({ name: "frontier", baseUrl: server.url, model: "strong-model", costPerRequest: 0.002 }),
      },
      threshold: 0.5,
    });

    const response = await gateway.handle({
      id: "http-1",
      messages: [{ role: "user", content: "What is 2 + 2?" }],
    });
    assert.equal(response.model, "frontier");
    assert.equal(response.choices[0].message.content, "answer from strong-model");
    assert.equal(response.usage.cost_usd, 0.002);
    assert.equal(response.cached, false);
  });
});
