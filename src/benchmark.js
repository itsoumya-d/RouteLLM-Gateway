// SPDX-License-Identifier: MIT
// Synthetic cost-accuracy harness for the router, cache, and providers.

import { BradleyTerryRouter, featurize } from "./router.js";
import { SemanticCache } from "./cache.js";
import { MockProvider } from "./providers.js";
import { createGateway } from "./gateway.js";

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return Math.abs(value);
}

function makeCase(index, difficulty, kind) {
  const a = (index * 37) % 90 + 10;
  const b = (index * 53) % 80 + 5;
  const c = (index * 17) % 40 + 2;
  let question;
  let expected;
  if (kind === "easy") {
    question = `What is ${a} + ${b}?`;
    expected = String(a + b);
  } else if (kind === "medium") {
    question = `Solve ${c}x + ${b} = ${c * a + b}. What is x?`;
    expected = String(a);
  } else {
    question = `A warehouse has ${a * c} units. It ships ${b} units per day for ${c} days, then receives ${a + b} units. Calculate the final inventory.`;
    expected = String(a * c - b * c + a + b);
  }
  return {
    id: `q-${index}`,
    difficulty,
    question,
    expected,
    kind,
  };
}

export function generateCases() {
  const cases = [];
  for (let i = 0; i < 1000; i++) {
    const bucket = i % 10;
    if (bucket < 4) cases.push(makeCase(i, 0.2, "easy"));
    else if (bucket < 7) cases.push(makeCase(i, 0.55, "medium"));
    else cases.push(makeCase(i, 0.85, "hard"));
  }
  return cases;
}

function accuracyFor(name, difficulty) {
  if (name === "frontier") return difficulty > 0.5 ? 0.985 : 0.99;
  if (difficulty < 0.35) return 0.97;
  if (difficulty < 0.7) return 0.94;
  return 0.62;
}

export function correctness(testCase, name) {
  const accuracy = accuracyFor(name, testCase.difficulty);
  return hash(`${testCase.id}:${name}`) % 10000 < Math.floor(accuracy * 10000);
}

function provider(name) {
  return new MockProvider({
    name,
    costPerRequest: name === "frontier" ? 0.002 : 0.0002,
    latencyMs: 0,
    accuracy: (difficulty) => accuracyFor(name, difficulty),
  });
}

async function evaluateSystem(cases, gateway) {
  let correct = 0;
  let cost = 0;
  let cacheHits = 0;
  const latencies = [];
  for (const testCase of cases) {
    const request = {
      id: testCase.id,
      messages: [{ role: "user", content: testCase.question }],
      difficulty: testCase.difficulty,
      expected: testCase.expected,
    };
    const response = await gateway.handle(request);
    if (response.cached) cacheHits++;
    const answer = response.choices[0].message.content;
    if (answer === testCase.expected) correct++;
    cost += response.usage.cost_usd;
    latencies.push(response.cached ? 0.5 : response.model === "frontier" ? 650 : 120);
  }
  latencies.sort((a, b) => a - b);
  const pct = (p) => latencies[Math.min(latencies.length - 1, Math.ceil(p * latencies.length) - 1)];
  return {
    accuracy: correct / cases.length,
    cost: Number(cost.toFixed(4)),
    cost_per_request: Number((cost / cases.length).toFixed(6)),
    p50_ms: pct(0.5),
    p95_ms: pct(0.95),
    cache_hit_rate: cacheHits / cases.length,
  };
}

export async function runBenchmark() {
  const all = generateCases();
  const train = all.slice(0, 600);
  const calibration = all.slice(600, 750);
  const originals = all.slice(750, 950);
  const paraphrases = originals.slice(0, 50).map((testCase) => ({
    ...testCase,
    question: `${testCase.question} Answer concisely.`,
  }));
  const test = [...originals, ...paraphrases];

  const training = [];
  for (const testCase of train) {
    const strong = correctness(testCase, "frontier");
    const weak = correctness(testCase, "fast");
    if (strong === weak) continue;
    training.push({ features: featurize(testCase.question), label: strong ? 1 : 0 });
  }
  const router = new BradleyTerryRouter().fit(training);
  const calibrationSamples = calibration.map((testCase) => ({
    features: featurize(testCase.question),
    strongCorrect: correctness(testCase, "frontier"),
    weakCorrect: correctness(testCase, "fast"),
  }));
  const strongAccuracy = calibrationSamples.filter((sample) => sample.strongCorrect).length / calibrationSamples.length;
  const threshold = router.chooseThreshold(calibrationSamples, { targetRetention: 0.98, strongAccuracy });
  const providers = { frontier: provider("frontier"), fast: provider("fast") };

  const alwaysStrong = createGateway({
    router, cache: new SemanticCache({ threshold: 2 }), providers, threshold: 0,
  });
  const alwaysWeak = createGateway({
    router, cache: new SemanticCache({ threshold: 2 }), providers, threshold: 2,
  });
  const routed = createGateway({
    router, cache: new SemanticCache({ threshold: 2 }), providers, threshold: threshold.threshold,
  });
  const routedCached = createGateway({
    router, cache: new SemanticCache({ threshold: 0.94 }), providers, threshold: threshold.threshold,
  });

  const strong = await evaluateSystem(test, alwaysStrong);
  const weak = await evaluateSystem(test, alwaysWeak);
  const routerOnly = await evaluateSystem(test, routed);
  const routerCache = await evaluateSystem(test, routedCached);
  return {
    benchmark: "synthetic-math-and-word-problems",
    note: "Mock providers with deterministic correctness. Not MMLU-Pro or GSM8K.",
    train_cases: train.length,
    calibration_cases: calibration.length,
    test_cases: test.length,
    threshold: Number(threshold.threshold.toFixed(3)),
    calibration_accuracy: Number(threshold.accuracy.toFixed(4)),
    systems: { always_strong: strong, always_weak: weak, router: routerOnly, router_plus_cache: routerCache },
    retention: Number((routerCache.accuracy / strong.accuracy).toFixed(4)),
    cost_reduction: Number((1 - routerCache.cost / strong.cost).toFixed(4)),
    router_weights: router.toJSON(),
  };
}
