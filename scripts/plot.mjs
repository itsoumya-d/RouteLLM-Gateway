#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(here, "..", "results", "pareto.json")));
const points = Object.entries(data.systems).map(([name, metrics]) => ({ name, ...metrics }));
const width = 900, height = 520, left = 80, top = 40, right = 40, bottom = 70;
const maxCost = Math.max(...points.map((point) => point.cost)) * 1.1;
const minAcc = Math.min(...points.map((point) => point.accuracy)) - 0.03;
const sx = (cost) => left + (cost / maxCost) * (width - left - right);
const sy = (acc) => top + (1 - (acc - minAcc) / (1 - minAcc)) * (height - top - bottom);
const colors = { always_strong: "#ef4444", always_weak: "#38bdf8", router: "#22c55e", router_plus_cache: "#a78bfa" };
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" font-family="ui-monospace,monospace">`,
  `<rect width="${width}" height="${height}" fill="#0b1020"/>`,
  `<rect x="${left}" y="${top}" width="${width-left-right}" height="${height-top-bottom}" fill="#11182b" stroke="#334155"/>`,
  `<line x1="${left}" y1="${height-bottom}" x2="${width-right}" y2="${height-bottom}" stroke="#94a3b8"/>`,
  `<line x1="${left}" y1="${top}" x2="${left}" y2="${height-bottom}" stroke="#94a3b8"/>`,
];
for (const point of points) {
  const x = sx(point.cost), y = sy(point.accuracy);
  svg.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${colors[point.name] ?? '#a78bfa'}"/>`);
  svg.push(`<text x="${(x+12).toFixed(1)}" y="${(y-10).toFixed(1)}" fill="${colors[point.name] ?? '#a78bfa'}" font-size="13">${point.name} (${(point.accuracy*100).toFixed(1)}%, $${point.cost.toFixed(3)})</text>`);
}
svg.push(`<text x="${width/2}" y="24" fill="#e2e8f0" font-size="16" text-anchor="middle">Synthetic cost-accuracy Pareto</text>`);
svg.push(`<text x="${width/2}" y="${height-18}" fill="#94a3b8" font-size="12" text-anchor="middle">Cost per 250 requests (USD)</text>`);
svg.push(`<text x="20" y="${height/2}" fill="#94a3b8" font-size="12" transform="rotate(-90 20 ${height/2})" text-anchor="middle">Accuracy</text>`);
svg.push("</svg>");
writeFileSync(join(here, "..", "results", "pareto.svg"), svg.join("\n") + "\n");
let csv = "system,accuracy,cost,p50_ms,p95_ms,cache_hit_rate\n";
for (const point of points) csv += `${point.name},${point.accuracy},${point.cost},${point.p50_ms},${point.p95_ms},${point.cache_hit_rate}\n`;
writeFileSync(join(here, "..", "results", "pareto.csv"), csv);
console.log("wrote results/pareto.svg and results/pareto.csv");
