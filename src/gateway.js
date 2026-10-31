// SPDX-License-Identifier: MIT
// Request pipeline: cache -> features -> calibrated route -> provider -> schema/drift.

import { featurize } from "./router.js";
import { validateSchema } from "./schema.js";

function promptFrom(request) {
  const messages = request.messages ?? [];
  return messages.map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content))).join("\n");
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function createGateway({ router, cache, providers, strong = "frontier", weak = "fast", threshold = 0.5 }) {
  if (!router || !cache || !providers[strong] || !providers[weak]) {
    throw new Error("gateway requires router, cache, and both providers");
  }

  async function callProvider(name, request, id) {
    return providers[name].complete({
      prompt: promptFrom(request),
      id: id ?? request.id ?? "0",
      difficulty: request.difficulty ?? 0.5,
      expected: request.expected ?? "",
    });
  }

  async function handle(request) {
    if (!request || !Array.isArray(request.messages)) throw new Error("messages array is required");
    const prompt = promptFrom(request);
    const cached = cache.get(prompt);
    if (cached) {
      return {
        id: request.id ?? `chatcmpl-${Date.now()}`,
        object: "chat.completion",
        model: "semantic-cache",
        choices: [{ index: 0, message: { role: "assistant", content: cached.text }, finish_reason: "stop" }],
        usage: { ...cached.usage, cost_usd: 0 },
        cached: true,
        routing: { p_strong: null, selected: "cache", reason: "similarity >= threshold" },
        drift: 0,
        fallback: false,
      };
    }

    const features = featurize(prompt);
    const pStrong = router.predict(features);
    let selected = pStrong >= threshold ? strong : weak;
    let result = await callProvider(selected, request);
    let fallback = false;

    const schema = request.response_format?.json_schema?.schema;
    if (schema) {
      let parsed;
      try { parsed = JSON.parse(result.text); } catch { parsed = undefined; }
      const validation = parsed === undefined ? { valid: false, errors: ["response is not JSON"] } : validateSchema(parsed, schema);
      if (!validation.valid && selected !== strong) {
        selected = strong;
        result = await callProvider(strong, request);
        fallback = true;
      }
    }

    const drift = Math.max(0, 1 - cosine(featurize(prompt), featurize(result.text)));
    const response = {
      id: request.id ?? `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      model: selected,
      choices: [{ index: 0, message: { role: "assistant", content: result.text }, finish_reason: "stop" }],
      usage: { ...result.usage, cost_usd: result.cost },
      cached: false,
      routing: {
        p_strong: Number(pStrong.toFixed(4)),
        selected,
        reason: pStrong >= threshold ? "complexity above threshold" : "complexity below threshold",
      },
      drift: Number(drift.toFixed(4)),
      drift_flag: drift > 0.98,
      fallback,
    };
    cache.set(prompt, result);
    return response;
  }

  async function* stream(request) {
    const response = await handle(request);
    const text = response.choices[0].message.content;
    for (let i = 0; i < text.length; i += 24) {
      yield { type: "delta", content: text.slice(i, i + 24) };
    }
    yield { type: "done", response };
  }

  return { handle, stream, cache };
}
