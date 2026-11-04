# RouteLLM-Gateway

Calibrated multi-model router with a semantic cache, strict output contracts,
and OpenAI/Anthropic-compatible streaming.

The gateway embeds each prompt, checks a semantic cache, computes a
Bradley-Terry win probability for the strong model versus the fast model, and
routes accordingly. A JSON-schema fallback upgrades to the strong model when the
weak model violates the output contract. Every response carries routing,
cache, cost, and drift metadata.

## Research basis

- RouteLLM: Learning to Route LLMs with Preference Data (arXiv:2406.18665)
- FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving
  Performance (arXiv:2305.05176)

## Pipeline

```
prompt ──▶ semantic cache ──hit──▶ cached completion ($0, ~0 ms)
                 │ miss
                 ▼
          featurize prompt
                 ▼
   P(strong ≻ weak | q) = σ(θᵀ φ(q))
                 ▼
      weak model ──schema fail──▶ strong model
                 ▼
        response + receipt metadata
```

- **Router:** logistic Bradley-Terry model trained on strong-vs-weak preference
  pairs. Features include length, digit/operator density, math/code/logic cues,
  option count, and a hashed bag-of-words sketch.
- **Semantic cache:** cosine similarity ≥ 0.94 plus a numeric-signature guard so
  `12 + 7` never serves the cached answer for `13 + 7`.
- **Schema contract:** a dependency-free JSON Schema subset. Invalid weak-model
  JSON triggers a strong-model fallback.
- **Drift:** prompt/answer embedding distance is returned as a diagnostic flag.

## API

```bash
node bin/route-gateway.mjs --port 8788
# POST /v1/chat/completions      OpenAI-compatible, stream=true supported
# POST /v1/messages              Anthropic-compatible shape
# GET  /health, /metrics
```

`HttpProvider` is a real OpenAI-compatible adapter for OpenAI, xAI Grok, vLLM,
Ollama, or any endpoint that speaks `POST /chat/completions`. The benchmark
still uses deterministic mocks; the HTTP adapter is exercised in tests against
a local fake server.

```js
import { HttpProvider } from "@itsoumya-d/route-gateway";

const providers = {
  fast: new HttpProvider({
    name: "fast",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    costPerRequest: 0.0002,
  }),
  frontier: new HttpProvider({
    name: "frontier",
    baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY,
    model: process.env.XAI_MODEL ?? "grok-2-latest",
    costPerRequest: 0.002,
  }),
};
```

The adapter forwards `model` and a single user message, sends
`Authorization: Bearer <apiKey>`, parses `choices[0].message.content` and
`usage`, and surfaces non-2xx bodies with the status code. `costPerRequest` is
an explicit caller-supplied estimate; the adapter does not invent a price.

## Measured synthetic benchmark

`npm run evaluate` — 600 training questions, 150 calibration, 250 test
(including 50 paraphrases), deterministic mock providers.

| System | Accuracy | Cost / 250 | p50 | p95 | Cache hit |
|---|---:|---:|---:|---:|---:|
| Always strong | 98.80% | $0.5000 | 650 ms | 650 ms | 0% |
| Always weak | 86.80% | $0.0500 | 120 ms | 120 ms | 0% |
| Router | 97.20% | $0.1868 | 120 ms | 650 ms | 0% |
| Router + cache | 97.20% | $0.1530 | 120 ms | 650 ms | 13.6% |

- Calibrated threshold: **0.74**
- Accuracy retention: **98.38%** of always-strong
- Cost reduction: **69.40%** vs always-strong

These are synthetic mock-provider results. They are **not** MMLU-Pro or GSM8K
measurements and must not be presented as such. Pareto data:
`results/pareto.json`, `results/pareto.csv`, `results/pareto.svg`.

## Tests

`npm test` — 16 tests covering router fitting/calibration, cache paraphrase hits
and numeric guards, schema validation, routing/caching, schema fallback,
streaming, HTTP/SSE/Anthropic surfaces, the Pareto target thresholds, and the
`HttpProvider` adapter against a local fake `chat/completions` server
(auth/model forwarding, parsing, non-2xx errors, missing content, gateway
integration).

## Limitations

- **No live vendor call was made.** Anthropic/OpenAI/xAI keys were not
  configured; the measured table uses deterministic mock providers with explicit
  cost and latency assumptions. The `HttpProvider` path is tested against a local
  fake HTTP server, not a paid vendor endpoint.
- **No MMLU-Pro/GSM8K run.** The harness is synthetic math/word problems. Real
  evaluation requires model credentials and the datasets.
- **Embeddings are hashed bag-of-words**, not edgeinfer/ONNX embeddings. The
  cache interface can accept an external embedder.
- **Storage is in-memory**, not pgvector/Oracle. The cache is bounded by entries
  and TTL.
- No Mobbin UI was required for the API; no dashboard is included.

## License

MIT. Copyright (c) 2024-2026 Soumya Debnath.
