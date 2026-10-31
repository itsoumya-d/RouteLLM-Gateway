// SPDX-License-Identifier: MIT
// Calibrated Bradley-Terry router over deterministic question features.

const MATH_HINTS = /(calculate|solve|integral|derivative|probability|equation|prove|step|how many|sum|product)/i;
const CODE_HINTS = /(code|function|python|rust|javascript|typescript|compile|runtime|algorithm|complexity)/i;
const LOGIC_HINTS = /(if |then |assume|therefore|all |some |none |implies|logic|syllogism)/i;

export function featurize(text) {
  const lower = String(text).toLowerCase();
  const words = lower.match(/[a-z0-9_]+/g) ?? [];
  const digits = (lower.match(/[0-9]/g) ?? []).length;
  const operators = (lower.match(/[+\-*/^=<>]/g) ?? []).length;
  const options = (lower.match(/\b[a-d][).]/g) ?? []).length;
  const features = [
    Math.min(words.length / 160, 1),
    Math.min(digits / 24, 1),
    Math.min(operators / 10, 1),
    MATH_HINTS.test(lower) ? 1 : 0,
    CODE_HINTS.test(lower) ? 1 : 0,
    LOGIC_HINTS.test(lower) ? 1 : 0,
    lower.includes("?") ? 1 : 0,
    Math.min(options / 4, 1),
  ];
  const base = features.length;
  const hashed = new Float64Array(32);
  for (const word of words) {
    let hash = 2166136261;
    for (let i = 0; i < word.length; i++) {
      hash ^= word.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hashed[Math.abs(hash) % hashed.length] += 1;
  }
  const norm = Math.sqrt(hashed.reduce((sum, value) => sum + value * value, 0)) || 1;
  for (let i = 0; i < hashed.length; i++) features.push(hashed[i] / norm);
  return Float64Array.from(features);
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export class BradleyTerryRouter {
  constructor(weights = null) {
    this.weights = weights ? Float64Array.from(weights) : null;
  }

  predict(features) {
    if (!this.weights) throw new Error("router is not fitted");
    return sigmoid(dot(this.weights, features));
  }

  fit(samples, { epochs = 400, lr = 0.15, l2 = 1e-4 } = {}) {
    if (!samples.length) throw new Error("training samples required");
    const dimension = samples[0].features.length;
    this.weights = new Float64Array(dimension);
    for (let epoch = 0; epoch < epochs; epoch++) {
      const gradient = new Float64Array(dimension);
      for (const sample of samples) {
        const error = this.predict(sample.features) - sample.label;
        for (let i = 0; i < dimension; i++) gradient[i] += error * sample.features[i];
      }
      for (let i = 0; i < dimension; i++) {
        gradient[i] = gradient[i] / samples.length + l2 * this.weights[i];
        this.weights[i] -= lr * gradient[i];
      }
    }
    return this;
  }

  chooseThreshold(samples, { targetRetention = 0.98, strongAccuracy, weakCost = 1, strongCost = 10 } = {}) {
    let best = { threshold: 0.5, cost: Infinity, accuracy: 0 };
    const total = samples.length;
    const strongOnly = samples.filter((sample) => sample.strongCorrect).length / total;
    const target = targetRetention * (strongAccuracy ?? strongOnly);
    for (let threshold = 0.05; threshold <= 0.951; threshold += 0.01) {
      let correct = 0;
      let strongCount = 0;
      for (const sample of samples) {
        const useStrong = this.predict(sample.features) >= threshold;
        if (useStrong) strongCount++;
        correct += useStrong ? Number(sample.strongCorrect) : Number(sample.weakCorrect);
      }
      const accuracy = correct / total;
      const cost = (strongCount * strongCost + (total - strongCount) * weakCost) / total;
      if (accuracy >= target && cost < best.cost) best = { threshold, cost, accuracy };
    }
    return best;
  }

  toJSON() {
    return { weights: Array.from(this.weights ?? []) };
  }

  static fromJSON(payload) {
    return new BradleyTerryRouter(payload.weights);
  }
}
