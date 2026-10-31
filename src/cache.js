// SPDX-License-Identifier: MIT
// Semantic cache with cosine similarity threshold and TTL/LRU bounds.

import { featurize } from "./router.js";

function signature(text) {
  return ((String(text).match(/-?\d+(?:\.\d+)?/g) ?? []).sort()).join(",");
}

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export class SemanticCache {
  constructor({ threshold = 0.94, maxEntries = 1000, ttlMs = 10 * 60 * 1000, now = () => Date.now() } = {}) {
    this.threshold = threshold;
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.now = now;
    this.entries = [];
    this.hits = 0;
    this.misses = 0;
  }

  get(text) {
    const vector = featurize(text);
    const textSignature = signature(text);
    const cutoff = this.now();
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry.expiresAt < cutoff) {
        this.entries.splice(i, 1);
        continue;
      }
      if (entry.signature === textSignature && cosine(vector, entry.vector) >= this.threshold) {
        entry.lastHit = cutoff;
        this.hits++;
        return entry.value;
      }
    }
    this.misses++;
    return null;
  }

  set(text, value) {
    const now = this.now();
    this.entries.push({
      vector: featurize(text),
      signature: signature(text),
      value,
      expiresAt: now + this.ttlMs,
      lastHit: now,
    });
    if (this.entries.length > this.maxEntries) this.entries.shift();
  }

  clear() {
    this.entries = [];
  }

  get stats() {
    const total = this.hits + this.misses;
    return { hits: this.hits, misses: this.misses, hitRate: total ? this.hits / total : 0, size: this.entries.length };
  }
}
