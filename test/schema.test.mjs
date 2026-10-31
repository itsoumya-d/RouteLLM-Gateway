// SPDX-License-Identifier: MIT
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateSchema } from '../src/schema.js';

const schema = {
  type: 'object',
  required: ['answer', 'confidence'],
  additionalProperties: false,
  properties: {
    answer: { type: 'string', maxLength: 20 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

describe('JSON schema validator', () => {
  test('accepts valid objects', () => {
    assert.equal(validateSchema({ answer: 'yes', confidence: 0.9 }, schema).valid, true);
  });

  test('rejects missing, extra, and out-of-range fields', () => {
    assert.equal(validateSchema({ answer: 'yes' }, schema).valid, false);
    assert.equal(validateSchema({ answer: 'yes', confidence: 2 }, schema).valid, false);
    assert.equal(validateSchema({ answer: 'yes', confidence: 0.5, extra: 1 }, schema).valid, false);
  });
});
