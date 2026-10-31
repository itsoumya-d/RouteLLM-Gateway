// SPDX-License-Identifier: MIT
// Small JSON Schema validator for output contracts (no dependency).

export function validateSchema(value, schema, path = "$") {
  if (!schema || typeof schema !== "object") return { valid: true, errors: [] };
  const errors = [];
  if (schema.type) {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    const expected = schema.type === "integer" ? "number" : schema.type;
    if (actual !== expected || (schema.type === "integer" && !Number.isInteger(value))) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return { valid: false, errors };
    }
  }
  if (schema.enum && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(value))) {
    errors.push(`${path}: value is not in enum`);
  }
  if (schema.type === "object" || schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in (value ?? {}))) errors.push(`${path}.${key}: required`);
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (key in (value ?? {})) errors.push(...validateSchema(value[key], child, `${path}.${key}`).errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value ?? {})) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}.${key}: additional property`);
      }
    }
  }
  if (schema.type === "array" && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.items) for (let i = 0; i < value.length; i++) errors.push(...validateSchema(value[i], schema.items, `${path}[${i}]`).errors);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: above maximum`);
  }
  if (typeof value === "string" && schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push(`${path}: string too long`);
  }
  return { valid: errors.length === 0, errors };
}
