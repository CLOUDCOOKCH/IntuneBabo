import type { JsonObject, JsonValue } from '../types/intune';

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value as JsonValue));
}

export function canonicalize(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(canonicalize).sort((left, right) => {
      const leftText = JSON.stringify(left);
      const rightText = JSON.stringify(right);
      return leftText.localeCompare(rightText);
    });
  }

  if (isJsonObject(value)) {
    return Object.keys(value)
      .sort()
      .reduce<JsonObject>((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }

  return value;
}
