#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFileSync } from "node:fs";
import { BradleyTerryRouter } from "../src/router.js";
import { SemanticCache } from "../src/cache.js";
import { MockProvider } from "../src/providers.js";
import { createGateway } from "../src/gateway.js";
import { startGateway } from "../src/server.js";

const args = process.argv.slice(2);
if (args[0] === "--version") { console.log("0.1.0"); process.exit(0); }
if (args[0] === "--help") {
  console.error("Usage: route-gateway [--port 8788] [--host 127.0.0.1]\n  POST /v1/chat/completions | /v1/messages | GET /health");
  process.exit(0);
}
const port = Number(args[args.indexOf("--port") + 1] || 8788);
const host = args[args.indexOf("--host") + 1] || "127.0.0.1";

let weights = new Array(40).fill(0);
try {
  const data = JSON.parse(readFileSync(new URL("../results/pareto.json", import.meta.url)));
  weights = data.router_weights.weights;
} catch {}
const router = new BradleyTerryRouter(weights);
const providers = {
  fast: new MockProvider({ name: "fast", costPerRequest: 0.0002, latencyMs: 120, accuracy: (d) => (d < 0.4 ? 0.97 : d < 0.7 ? 0.94 : 0.62) }),
  frontier: new MockProvider({ name: "frontier", costPerRequest: 0.002, latencyMs: 650, accuracy: () => 0.985 }),
};
const gateway = createGateway({
  router,
  cache: new SemanticCache({ threshold: 0.94 }),
  providers,
  threshold: 0.74,
});
const server = await startGateway({ gateway, host, port });
console.error(`RouteLLM gateway demo listening on ${server.url}`);
