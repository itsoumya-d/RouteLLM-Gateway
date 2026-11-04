// SPDX-License-Identifier: MIT
// Provider adapters. MockProvider makes the router/eval harness reproducible;
// HttpProvider talks to any OpenAI-compatible chat-completions endpoint.

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

function delay(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export class MockProvider {
  constructor({ name, costPerRequest, latencyMs, accuracy }) {
    this.name = name;
    this.costPerRequest = costPerRequest;
    this.latencyMs = latencyMs;
    this.accuracy = accuracy;
  }

  async complete({ prompt, id = "0", difficulty = 0.5, expected = "" }) {
    await delay(this.latencyMs);
    const threshold = Math.floor(this.accuracy(difficulty) * 10000);
    const correct = hash(`${id}:${this.name}`) % 10000 < threshold;
    return {
      text: correct ? expected : `Incorrect answer from ${this.name}`,
      usage: { prompt_tokens: prompt.split(/\s+/).length, completion_tokens: 16 },
      cost: this.costPerRequest,
      latencyMs: this.latencyMs,
      correct,
    };
  }

  async *stream(request) {
    const result = await this.complete(request);
    const words = result.text.split(" ");
    for (let i = 0; i < words.length; i += 4) {
      yield words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "");
    }
  }
}

export class ScriptedProvider {
  constructor(name, text, { cost = 0, latencyMs = 0 } = {}) {
    this.name = name;
    this.text = text;
    this.cost = cost;
    this.latencyMs = latencyMs;
    this.calls = 0;
  }

  async complete({ prompt }) {
    this.calls++;
    return {
      text: this.text,
      usage: { prompt_tokens: prompt.length, completion_tokens: this.text.length },
      cost: this.cost,
      latencyMs: this.latencyMs,
    };
  }

  async *stream() {
    yield this.text;
  }
}

export class HttpProvider {
  constructor({
    name,
    baseUrl,
    apiKey = "",
    model,
    costPerRequest = 0,
    timeoutMs = 30000,
    headers = {},
    fetchImpl = globalThis.fetch,
  }) {
    if (!baseUrl) throw new Error("baseUrl is required");
    if (!model) throw new Error("model is required");
    if (typeof fetchImpl !== "function") throw new Error("fetch is required");
    this.name = name ?? model;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.model = model;
    this.costPerRequest = costPerRequest;
    this.timeoutMs = timeoutMs;
    this.headers = headers;
    this.fetchImpl = fetchImpl;
  }

  async complete({ prompt }) {
    if (typeof prompt !== "string" || prompt.length === 0) {
      throw new Error("prompt is required");
    }
    const started = performance.now();
    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        ...this.headers,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `provider ${this.name} returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new Error(`provider ${this.name} returned no text content`);
    }
    const usage = data.usage ?? {};
    return {
      text,
      usage: {
        prompt_tokens: Number(usage.prompt_tokens ?? 0),
        completion_tokens: Number(usage.completion_tokens ?? 0),
      },
      cost: this.costPerRequest,
      latencyMs: Math.round(performance.now() - started),
    };
  }

  async *stream({ prompt }) {
    const result = await this.complete({ prompt });
    const words = result.text.split(" ");
    for (let i = 0; i < words.length; i += 4) {
      yield words.slice(i, i + 4).join(" ") + (i + 4 < words.length ? " " : "");
    }
  }
}
