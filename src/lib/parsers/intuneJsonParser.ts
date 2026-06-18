import type { JsonObject, JsonValue } from '../../types/intune';
import type {
  ImportDiagnostic,
  ImportIssue,
  ImportSourceDocument,
  NormalizedPolicy,
  NormalizedSetting,
  PolicyType,
  TenantKey,
} from '../../types/tenantdiff';
import { decodeTextFile } from '../../utils/decodeTextFile';
import { stableStringify } from '../../utils/stableJson';
import { normalizePolicyNameV2, splitPrefixes } from '../normalization/policyName';
import { describeSetting, formatSettingValue } from '../normalization/settingDictionary';
import { humanizeSettingName } from '../normalization/settingName';

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonValue(value: unknown): JsonValue {
  if (value === undefined) {
    return null;
  }
  return value as JsonValue;
}

function detectPolicyType(policy: JsonObject): PolicyType {
  const odataType = String(policy['@odata.type'] ?? '').toLocaleLowerCase();
  const templateFamily = isObject(policy.templateReference) ? String(policy.templateReference.templateFamily ?? '') : '';

  if (odataType.includes('configurationpolicy')) return templateFamily.includes('baseline') ? 'securityBaseline' : 'settingsCatalog';
  if (odataType.includes('deviceconfiguration')) return 'deviceConfiguration';
  if (odataType.includes('compliance')) return 'compliancePolicy';
  if (odataType.includes('managedapppolicy') || odataType.includes('appprotection')) return 'appProtection';
  return 'unknown';
}

function valueType(value: JsonValue): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function findFirstString(value: JsonValue, keys: string[]): string | null {
  if (!isObject(value)) return null;
  for (const key of keys) {
    const child = value[key];
    if (typeof child === 'string' && child.trim()) return child.trim();
  }
  for (const child of Object.values(value)) {
    const found = findFirstString(child, keys);
    if (found) return found;
  }
  return null;
}

function findOwnString(value: JsonValue, keys: string[]): string | null {
  if (!isObject(value)) return null;
  for (const key of keys) {
    const child = value[key];
    if (typeof child === 'string' && child.trim()) return child.trim();
  }
  return null;
}

function normalizeSettingPath(path: string): string {
  return path
    .toLocaleLowerCase()
    .replace(/[-_|:]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

function simplifySettingId(id: string): string {
  const policyMarker = '~policy~';
  if (id.includes(policyMarker)) {
    const afterPolicy = id.slice(id.lastIndexOf(policyMarker) + policyMarker.length);
    const segments = afterPolicy.split(/[~.]/).filter(Boolean);
    return segments.at(-1) ?? id;
  }

  const dotSegments = id.split('.').filter(Boolean);
  return dotSegments.at(-1) ?? id;
}

function unwrapGraphValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(unwrapGraphValue);
  }

  if (!isObject(value)) return value;

  if ('value' in value && Object.keys(value).every((key) => key.includes('@odata') || key === 'value')) {
    return unwrapGraphValue(value.value);
  }

  if ('value' in value && ('settingValueTemplateReference' in value || 'children' in value || '@odata.type' in value)) {
    return unwrapGraphValue(value.value);
  }

  if ('values' in value) return unwrapGraphValue(value.values);

  const cleaned = Object.entries(value)
    .filter(([key]) => !key.includes('@odata') && !key.endsWith('TemplateReference'))
    .reduce<JsonObject>((result, [key, child]) => {
      result[key] = unwrapGraphValue(child);
      return result;
    }, {});

  if ('value' in cleaned && Object.keys(cleaned).length === 1) return unwrapGraphValue(cleaned.value);
  return cleaned;
}

function createSetting(id: string, displayName: string | null, value: JsonValue, source: string, raw: JsonValue): NormalizedSetting {
  const simplifiedId = simplifySettingId(id);
  const unwrappedValue = unwrapGraphValue(value);
  const descriptor = describeSetting(simplifiedId, displayName ?? undefined);
  return {
    id: simplifiedId,
    displayName: descriptor.label || displayName?.trim() || humanizeSettingName(simplifiedId),
    normalizedPath: normalizeSettingPath(simplifiedId),
    value: unwrappedValue,
    valueType: valueType(unwrappedValue),
    source,
    raw,
  };
}

interface DefinitionOptionInfo {
  itemId: string;
  displayName?: string;
  optionValue?: JsonValue;
}

interface DefinitionInfo {
  id: string;
  displayName?: string;
  options: DefinitionOptionInfo[];
}

function definitionMapFromRaw(raw: JsonValue): Map<string, DefinitionInfo> {
  if (!isObject(raw) || !Array.isArray(raw.settingDefinitions)) return new Map();
  return raw.settingDefinitions.filter(isObject).reduce<Map<string, DefinitionInfo>>((map, definition) => {
    const id = typeof definition.id === 'string' ? definition.id : typeof definition.rootDefinitionId === 'string' ? definition.rootDefinitionId : undefined;
    if (!id) return map;
    map.set(id, {
      id,
      displayName: typeof definition.displayName === 'string' ? definition.displayName : typeof definition.name === 'string' ? definition.name : undefined,
      options: Array.isArray(definition.options)
        ? definition.options
            .filter(isObject)
            .map((option) => ({
              itemId: typeof option.itemId === 'string' ? option.itemId : '',
              displayName:
                typeof option.displayName === 'string'
                  ? option.displayName
                  : typeof option.name === 'string'
                    ? option.name
                    : undefined,
              optionValue: isObject(option.optionValue) && 'value' in option.optionValue ? asJsonValue(option.optionValue.value) : undefined,
            }))
            .filter((option) => option.itemId)
        : [],
    });
    return map;
  }, new Map());
}

function displayNameFromDefinition(id: string, definitions: Map<string, DefinitionInfo>, fallback: string | null): string | null {
  return definitions.get(id)?.displayName ?? fallback;
}

function valueFromChoiceDefinition(id: string, itemId: string, definitions: Map<string, DefinitionInfo>): JsonValue | undefined {
  const definition = definitions.get(id);
  const option = definition?.options.find((entry) => entry.itemId === itemId);
  return option?.optionValue ?? option?.displayName;
}

function childrenFromValueContainer(container: JsonValue): JsonValue[] {
  if (!isObject(container)) return [];
  const children = container.children;
  return Array.isArray(children) ? children : [];
}

function valueFromContainer(container: JsonValue): JsonValue | undefined {
  if (!isObject(container)) return undefined;

  if ('value' in container) return asJsonValue(container.value);
  if ('values' in container) return asJsonValue(container.values);
  if ('children' in container) return asJsonValue(container.children);

  return undefined;
}

function settingValueFromInstance(instance: JsonObject): JsonValue | undefined {
  const simple = instance.simpleSettingValue;
  if (simple !== undefined) return valueFromContainer(simple) ?? asJsonValue(simple);

  const choice = instance.choiceSettingValue;
  if (choice !== undefined) return valueFromContainer(choice) ?? asJsonValue(choice);

  const collection = instance.simpleSettingCollectionValue ?? instance.choiceSettingCollectionValue ?? instance.groupSettingCollectionValue;
  if (collection !== undefined) return valueFromContainer(collection) ?? asJsonValue(collection);

  if ('value' in instance) return asJsonValue(instance.value);

  return undefined;
}

function collectChildInstances(instance: JsonObject): JsonValue[] {
  const containers = [
    instance.simpleSettingValue,
    instance.choiceSettingValue,
    instance.simpleSettingCollectionValue,
    instance.choiceSettingCollectionValue,
    instance.groupSettingCollectionValue,
  ];

  return containers.flatMap(childrenFromValueContainer);
}

function settingsFromInstance(
  instance: JsonObject,
  source: string,
  raw: JsonValue,
  fallbackId: string,
  definitions: Map<string, DefinitionInfo>,
): NormalizedSetting[] {
  const id =
    findOwnString(instance, ['settingDefinitionId', 'settingInstanceTemplateId', 'settingValueTemplateId']) ??
    fallbackId;
  const displayName = displayNameFromDefinition(id, definitions, findOwnString(instance, ['displayName', 'name']));
  const rawValue = settingValueFromInstance(instance);
  const choiceValue =
    typeof rawValue === 'string' && rawValue.startsWith('device_vendor_') ? valueFromChoiceDefinition(id, rawValue, definitions) : undefined;
  const value = choiceValue ?? rawValue;
  const settings: NormalizedSetting[] = value === undefined ? [] : [createSetting(id, displayName, value, source, raw)];

  collectChildInstances(instance).forEach((child, index) => {
    if (isObject(child)) {
      settings.push(...settingsFromAnySetting(child, `${source}.children`, raw, `${id}.child.${index}`, definitions));
    }
  });

  return settings;
}

function settingsFromAnySetting(
  setting: JsonValue,
  source: string,
  raw: JsonValue,
  fallbackId: string,
  definitions = definitionMapFromRaw(raw),
): NormalizedSetting[] {
  if (!isObject(setting)) return [];

  if (isObject(setting.settingInstance)) {
    return settingsFromInstance(setting.settingInstance, source, raw, fallbackId, definitions);
  }

  if (findOwnString(setting, ['settingDefinitionId', 'settingInstanceTemplateId', 'settingValueTemplateId'])) {
    return settingsFromInstance(setting, source, raw, fallbackId, definitions);
  }

  return [];
}

function settingFromDeviceConfigObject(raw: JsonObject, index: number, source: string): NormalizedSetting {
  const id = findOwnString(raw, ['omaUri', 'displayName', 'name']) ?? `${source}.${index}`;
  const displayName = findOwnString(raw, ['displayName', 'name']) ?? id;
  const value = 'value' in raw ? asJsonValue(raw.value) : 'isEncrypted' in raw ? asJsonValue(raw.isEncrypted) : asJsonValue(raw);
  return createSetting(id, displayName, value, source, raw);
}

function flattenObjectSettings(value: JsonValue, basePath = 'settings'): NormalizedSetting[] {
  if (!isObject(value)) return [];
  return Object.entries(value)
    .filter(
      ([key]) =>
        !key.includes('@odata') &&
        ![
          'id',
          'displayName',
          'name',
          'description',
          'createdDateTime',
          'lastModifiedDateTime',
          'roleScopeTagIds',
          'version',
          'assignments',
        ].includes(key),
    )
    .map(([key, child]) => ({
      id: `${basePath}.${key}`,
      displayName: key,
      normalizedPath: normalizeSettingPath(`${basePath}.${key}`),
      value: asJsonValue(child),
      valueType: valueType(asJsonValue(child)),
      source: basePath,
      raw: child,
    }));
}

function shouldTreatPolicyAsMetadataOnly(policy: JsonObject): boolean {
  const meaningfulKeys = Object.keys(policy).filter(
    (key) =>
      !key.includes('@odata') &&
      ![
        'id',
        'displayName',
        'name',
        'description',
        'createdDateTime',
        'lastModifiedDateTime',
        'version',
        'roleScopeTagIds',
        'assignments',
        'platform',
        'platforms',
        'technologies',
        'templateReference',
      ].includes(key),
  );

  if (meaningfulKeys.length === 0) return true;
  if (meaningfulKeys.length === 1 && Array.isArray(policy[meaningfulKeys[0] ?? ''])) return true;
  return false;
}

function extractSettings(policy: JsonObject): { settings: NormalizedSetting[]; metadataOnly: boolean } {
  const settings = policy.settings;
  if (Array.isArray(settings)) {
    const parsed = settings.flatMap((setting, index) => settingsFromAnySetting(setting, 'settings', setting, `settings.${index}`));
    return {
      settings: parsed.length > 0 ? parsed : settings.filter(isObject).map((setting, index) => settingFromDeviceConfigObject(setting, index, 'settings')),
      metadataOnly: false,
    };
  }
  if (isObject(settings)) {
    return { settings: flattenObjectSettings(settings), metadataOnly: false };
  }

  const candidates = ['omaSettings', 'configurationSettings', 'scheduledActionsForRule'];
  for (const key of candidates) {
    const candidate = policy[key];
    if (Array.isArray(candidate)) {
      return { settings: candidate.filter(isObject).map((setting, index) => settingFromDeviceConfigObject(setting, index, key)), metadataOnly: false };
    }
    if (isObject(candidate)) {
      return { settings: flattenObjectSettings(candidate, key), metadataOnly: false };
    }
  }

  if (shouldTreatPolicyAsMetadataOnly(policy)) return { settings: [], metadataOnly: true };
  return { settings: flattenObjectSettings(policy, 'raw'), metadataOnly: false };
}

function fileBaseName(fileName: string): string {
  return fileName.replace(/\.json$/i, '').trim() || fileName;
}

function policyName(policy: JsonObject, index: number, fallbackName: string): string {
  const value = policy.displayName ?? policy.name;
  return typeof value === 'string' && value.trim() ? value.trim() : `${fallbackName} ${index + 1}`.trim();
}

function looksLikeSettingObject(value: unknown): value is JsonObject {
  return (
    isObject(value) &&
    ('settingInstance' in value ||
      'settingDefinitions@odata.navigationLink' in value ||
      'settingDefinitions@odata.associationLink' in value ||
      findFirstString(value, ['settingDefinitionId']) !== null)
  );
}

function isSettingsCollection(input: unknown, items: JsonObject[]): boolean {
  if (items.length === 0) return false;

  const policyLikeItems = items.filter((item) => typeof item.displayName === 'string' || typeof item.name === 'string').length;
  const settingLikeItems = items.filter(looksLikeSettingObject).length;
  if (policyLikeItems > 0) return false;
  if (settingLikeItems === 0 || settingLikeItems / items.length < 0.6) return false;

  if (isObject(input)) {
    const context = String(input['@odata.context'] ?? '').toLocaleLowerCase();
    if (context.includes('/settings') || context.includes('configurationpolicies') && context.includes('settings')) {
      return true;
    }
  }

  return true;
}

type ParserKind = ImportDiagnostic['parser'];

function diagnosticConfidence(parser: ParserKind, policies: NormalizedPolicy[]): ImportDiagnostic['confidence'] {
  if (policies.length === 0) return 'low';
  const settingCount = policies.reduce((total, policy) => total + policy.settings.length, 0);
  if (parser === 'fallback' || settingCount === 0) return 'low';
  if (parser === 'single-policy' || parser === 'settings-collection') return 'medium';
  return 'high';
}

function policyItems(input: unknown, fileName: string): { items: JsonObject[]; parser: ParserKind; policyObjectsFound: number; skippedObjects: number } {
  if (Array.isArray(input)) {
    const items = input.filter(isObject);
    return isSettingsCollection(input, items)
      ? { items: [{ name: fileBaseName(fileName), settings: items }], parser: 'settings-collection', policyObjectsFound: input.length, skippedObjects: input.length - items.length }
      : { items, parser: 'policy-list', policyObjectsFound: input.length, skippedObjects: input.length - items.length };
  }

  if (isObject(input) && Array.isArray(input.value)) {
    const items = input.value.filter(isObject);
    return isSettingsCollection(input, items)
      ? { items: [{ name: fileBaseName(fileName), settings: items }], parser: 'settings-collection', policyObjectsFound: input.value.length, skippedObjects: input.value.length - items.length }
      : { items, parser: 'policy-list', policyObjectsFound: input.value.length, skippedObjects: input.value.length - items.length };
  }

  if (isObject(input)) {
    return {
      items: [input],
      parser: typeof input.displayName === 'string' || typeof input.name === 'string' ? 'single-policy' : 'fallback',
      policyObjectsFound: 1,
      skippedObjects: 0,
    };
  }
  throw new Error('Expected a JSON object, JSON array, or Microsoft Graph response with a value array.');
}

export async function parseTenantDocuments(documents: ImportSourceDocument[], tenant: TenantKey, tenantName: string, prefixInput: string): Promise<{
  policies: NormalizedPolicy[];
  issues: ImportIssue[];
  diagnostics: ImportDiagnostic[];
  fileNames: string[];
}> {
  const issues: ImportIssue[] = [];
  const diagnostics: ImportDiagnostic[] = [];
  const policies: NormalizedPolicy[] = [];
  const prefixes = splitPrefixes(prefixInput);

  for (const document of documents) {
    try {
      if (document.size > 10 * 1024 * 1024) {
        issues.push({ fileName: document.name, severity: 'warning', message: 'Large file. Processing may take a moment.', source: document.sourceKind, sourceId: document.sourceRef });
      }
      const json = JSON.parse(document.text) as unknown;
      const parsed = policyItems(json, document.name);
      const items = parsed.items;
      const beforeCount = policies.length;

      if (items.length === 0) {
        issues.push({ fileName: document.name, severity: 'warning', message: 'No policy objects found.', source: document.sourceKind, sourceId: document.sourceRef });
      }

      items.forEach((item, index) => {
        const displayName = policyName(item, index, fileBaseName(document.name));
        const extracted = extractSettings(item);
        const warnings = extracted.settings.length === 0 ? ['No comparable settings found. Raw JSON is still retained.'] : [];
        policies.push({
          id: typeof item.id === 'string' ? item.id : `${document.name}:${index}`,
          displayName,
          normalizedName: normalizePolicyNameV2(displayName, prefixes),
          sourceTenant: tenant,
          sourceKind: document.sourceKind,
          sourceRef: document.sourceRef,
          policyType: detectPolicyType(item),
          description: typeof item.description === 'string' ? item.description : undefined,
          platform: typeof item.platforms === 'string' ? item.platforms : typeof item.platform === 'string' ? item.platform : undefined,
          technologies: typeof item.technologies === 'string' ? item.technologies : undefined,
          assignments: Array.isArray(item.assignments) ? item.assignments : [],
          settings: extracted.settings,
          rawJson: item,
          sourceFile: document.name,
          warnings,
          isMetadataOnly: extracted.metadataOnly,
          isUnsupported: extracted.settings.length === 0,
        });
      });

      const parsedPolicies = policies.slice(beforeCount);
      const duplicateGroups = parsedPolicies
        .map((policy) => policy.normalizedName)
        .filter((value, index, list) => list.indexOf(value) !== index)
        .filter((value, index, list) => list.indexOf(value) === index);
      diagnostics.push({
        sourceId: document.sourceRef,
        fileName: document.name,
        sourceRef: document.sourceRef,
        sourceKind: document.sourceKind,
        parser: parsed.parser,
        policyObjectsFound: parsed.policyObjectsFound,
        policyCount: parsedPolicies.length,
        normalizedPolicies: parsedPolicies.length,
        settingCount: parsedPolicies.reduce((total, policy) => total + policy.settings.length, 0),
        skippedObjects: parsed.skippedObjects,
        unsupportedPolicies: parsedPolicies.filter((policy) => policy.isUnsupported).length,
        metadataOnlyPolicies: parsedPolicies.filter((policy) => policy.isMetadataOnly).length,
        duplicateGroups,
        confidence: diagnosticConfidence(parsed.parser, parsedPolicies),
        samplePolicies: parsedPolicies.slice(0, 5).map((policy) => ({
          displayName: policy.displayName,
          normalizedName: policy.normalizedName,
          policyType: policy.policyType,
          settingCount: policy.settings.length,
          sampleSettings: policy.settings.slice(0, 5).map((setting) => ({
            displayName: setting.displayName,
            path: setting.normalizedPath,
            valuePreview: formatSettingValue(setting.normalizedPath, setting.value),
          })),
        })),
        warnings: parsedPolicies.flatMap((policy) => policy.warnings),
        endpoint: document.sourceKind === 'graph' ? document.sourceRef : undefined,
      });
    } catch (error) {
      issues.push({
        fileName: document.name,
        severity: 'error',
        message: error instanceof Error ? error.message : 'Unable to parse JSON file.',
        source: document.sourceKind,
        sourceId: document.sourceRef,
        endpoint: document.sourceKind === 'graph' ? document.sourceRef : undefined,
      });
    }
  }

  const seen = new Map<string, number>();
  policies.forEach((policy) => seen.set(policy.normalizedName, (seen.get(policy.normalizedName) ?? 0) + 1));
  seen.forEach((count, normalizedName) => {
    if (count > 1) {
      const matchingPolicies = policies
        .filter((policy) => policy.normalizedName === normalizedName)
        .map((policy) => `${policy.displayName} (${policy.sourceFile})`);
      issues.push({
        fileName: tenantName,
        severity: 'warning',
        message: `Duplicate normalized policy name: ${normalizedName}`,
        details: matchingPolicies,
        source: matchingPolicies.some((policy) => policy.includes('graph-')) ? 'graph' : 'json',
      });
    }
  });

  return { policies, issues, diagnostics, fileNames: documents.map((document) => document.name) };
}

export async function parseTenantFiles(files: File[], tenant: TenantKey, tenantName: string, prefixInput: string): Promise<{
  policies: NormalizedPolicy[];
  issues: ImportIssue[];
  diagnostics: ImportDiagnostic[];
  fileNames: string[];
}> {
  const documents = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      text: decodeTextFile(await file.arrayBuffer()),
      size: file.size,
      sourceKind: 'json' as const,
      sourceRef: file.name,
    })),
  );
  return parseTenantDocuments(documents, tenant, tenantName, prefixInput);
}

export function previewValue(value: JsonValue): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}
