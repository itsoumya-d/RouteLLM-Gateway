// SPDX-License-Identifier: MIT
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { BradleyTerryRouter, featurize } from '../src/router.js';

function sample(question, label) {
  return { features: featurize(question), label };
}

describe('Bradley-Terry router', () => {
  test('learns complexity ordering and calibrates a threshold', () => {
    const samples = [
      sample('What is 2 + 3?', 0),
      sample('What is 7 + 4?', 0),
      sample('Solve 3x + 5 = 20. What is x?', 1),
      sample('Calculate the final inventory after shipping 40 units per day for 12 days.', 1),
      sample('Prove the integral step by step with probability bounds.', 1),
    ];
    const router = new BradleyTerryRouter().fit(samples, { epochs: 600 });
    const easy = router.predict(featurize('What is 4 + 4?'));
    const hard = router.predict(featurize('Prove the integral step by step with probability bounds.'));
    assert.ok(hard > easy);
    const calibration = samples.map((item) => ({
      features: item.features,
      strongCorrect: item.label === 1,
      weakCorrect: item.label === 0,
    }));
    const choice = router.chooseThreshold(calibration, { targetRetention: 0.5, strongAccuracy: 1 });
    assert.ok(choice.threshold >= 0 && choice.threshold <= 1);
    const restored = BradleyTerryRouter.fromJSON(JSON.parse(JSON.stringify(router.toJSON())));
    assert.equal(restored.predict(featurize('What is 4 + 4?')), easy);
  });

  test('rejects predictions before fitting', () => {
    assert.throws(() => new BradleyTerryRouter().predict(featurize('x')));
  });
});
