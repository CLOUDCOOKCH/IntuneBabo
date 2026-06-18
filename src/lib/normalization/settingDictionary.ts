import type { JsonObject, JsonValue } from '../../types/intune';
import { stableStringify } from '../../utils/stableJson';
import { describeCatalogSetting, formatCatalogValue, normalizeCatalogKey, semanticCatalogValue } from './settingCatalog';

export function describeSetting(path: string, fallbackName?: string): { label: string; category: string; family: string; isKnown: boolean } {
  const description = describeCatalogSetting(path, fallbackName);
  return {
    label: description.label,
    category: description.category,
    family: description.family,
    isKnown: description.isKnown,
  };
}

export function semanticSettingValue(path: string, value: JsonValue): JsonValue {
  return semanticCatalogValue(path, value);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item) ?? null);
  }
  if (isJsonObject(value)) {
    return Object.entries(value).reduce<JsonObject>((result, [key, item]) => {
      result[key] = toJsonValue(item) ?? null;
      return result;
    }, {});
  }
  return String(value);
}

export function formatSettingValue(path: string, value: unknown): string {
  const jsonValue = toJsonValue(value);
  if (jsonValue === undefined || jsonValue === null) return 'Not configured';

  const formatted = formatCatalogValue(path, jsonValue);
  if (formatted) return formatted;

  if (typeof jsonValue === 'number' || typeof jsonValue === 'string') return String(jsonValue);

  const text = stableStringify(jsonValue);
  return text.length > 600 ? `${text.slice(0, 600)}...` : JSON.stringify(jsonValue, null, 2);
}

export function canonicalSettingKey(path: string): string {
  return normalizeCatalogKey(path);
}
