# RouteLLM-Gateway Results

## Environment

| Item | Value |
|---|---|
| Date | 2026-10-31 |
| OS | macOS (Apple Silicon) |
| Node | 26.3.0 |
| Tests | 12/12 passing |
| Providers | Deterministic mocks (no API keys) |
| Dataset | Synthetic math/word problems, 1,000 cases |

## Benchmark protocol

- 600 training questions, 150 calibration, 250 test.
- 50 test cases are paraphrases of earlier questions to exercise the semantic
  cache.
- Strong provider: 98.5–99% deterministic accuracy, $0.002/request, 650 ms.
- Fast provider: 97% easy / 94% medium / 62% hard, $0.0002/request, 120 ms.
- Router threshold selected on calibration to retain 98% of strong accuracy and
  minimise cost.

## Results

Command: `npm run evaluate`

| System | Accuracy | Cost / 250 | Cost / request | p50 | p95 | Cache hit |
|---|---:|---:|---:|---:|---:|---:|
| Always strong | 98.80% | $0.5000 | $0.002000 | 650 ms | 650 ms | 0% |
| Always weak | 86.80% | $0.0500 | $0.000200 | 120 ms | 120 ms | 0% |
| Router | 97.20% | $0.1868 | $0.000747 | 120 ms | 650 ms | 0% |
| Router + cache | 97.20% | $0.1530 | $0.000612 | 120 ms | 650 ms | 13.6% |

- Threshold: **0.74**
- Retention: **98.38%** of always-strong accuracy
- Cost reduction: **69.40%** vs always-strong
- The router sends hard questions to the strong model and easy/medium questions
  to the fast model; paraphrases are served from cache for $0.

## Not executed

- **MMLU-Pro / GSM8K** with real models — no provider credentials or GPUs.
- **Real Anthropic/OpenAI/Gemini adapters** — the gateway surface is compatible,
  but the benchmark uses mocks.
- **edgeinfer/ONNX embeddings or pgvector** — hashed embeddings and in-memory
  cache are used for a dependency-free reproducible run.
- **Mobbin UI/dashboard** — not part of this API deliverable.

## Reproduce

```bash
cd repos/RouteLLM-Gateway
npm test
npm run evaluate
node scripts/plot.mjs
```
