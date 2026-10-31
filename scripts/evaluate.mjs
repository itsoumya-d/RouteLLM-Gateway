#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmark } from "../src/benchmark.js";

const here = dirname(fileURLToPath(import.meta.url));
const result = await runBenchmark();
mkdirSync(join(here, "..", "results"), { recursive: true });
writeFileSync(join(here, "..", "results", "pareto.json"), JSON.stringify(result, null, 2) + "\n");
console.log("| System | Accuracy | Cost | p50 | p95 | Cache hit |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const [name, metrics] of Object.entries(result.systems)) {
  console.log(`| ${name} | ${(metrics.accuracy * 100).toFixed(2)}% | $${metrics.cost.toFixed(4)} | ${metrics.p50_ms} ms | ${metrics.p95_ms} ms | ${(metrics.cache_hit_rate * 100).toFixed(1)}% |`);
}
console.log(`\nThreshold ${result.threshold}, retention ${(result.retention * 100).toFixed(2)}%, cost reduction ${(result.cost_reduction * 100).toFixed(2)}%`);
console.log("wrote results/pareto.json");
