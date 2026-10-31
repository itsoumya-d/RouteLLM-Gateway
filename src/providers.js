// SPDX-License-Identifier: MIT
// Provider adapters. MockProvider makes the router/eval harness reproducible.

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
