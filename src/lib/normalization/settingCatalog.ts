import type { JsonValue } from '../../types/intune';
import { humanizeSettingName } from './settingName';

export interface SettingCatalogEntry {
  key: string;
  label: string;
  family: string;
  category: string;
  aliases?: string[];
  semanticValue?: (value: JsonValue) => JsonValue;
  formatValue?: (value: JsonValue) => string | undefined;
}

export interface SettingDescription {
  label: string;
  family: string;
  category: string;
  canonicalKey: string;
  isKnown: boolean;
}

const entries: SettingCatalogEntry[] = [
  { key: 'allowarchivescanning', label: 'Scan archive files', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowbehaviormonitoring', label: 'Enable behavior monitoring', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowcloudprotection', label: 'Enable cloud-delivered protection', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowemailscanning', label: 'Scan email', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowfullscanonmappednetworkdrivescanning', label: 'Scan mapped network drives during full scan', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowfullscanremovabledrivescanning', label: 'Scan removable drives during full scan', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowioavprotection', label: 'Scan downloaded files and attachments', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowrealtimemonitoring', label: 'Enable real-time protection', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'allowscriptscanning', label: 'Scan scripts', family: 'Defender', category: 'Microsoft Defender Antivirus' },
  { key: 'browseraddprofileenabled', label: 'Allow adding browser profiles', family: 'Microsoft Edge', category: 'Profiles' },
  { key: 'browserguestmodeenabled', label: 'Allow guest mode', family: 'Microsoft Edge', category: 'Profiles' },
  { key: 'browsernetworktimequeriesenabled', label: 'Allow browser network time queries', family: 'Microsoft Edge', category: 'Browser services' },
  { key: 'browserthemecolor', label: 'Browser theme color', family: 'Google Chrome', category: 'Appearance' },
  { key: 'preventenablinglockscreencamera', label: 'Prevent enabling lock screen camera', family: 'Device Lock', category: 'Lock screen' },
  { key: 'localnetworkaccessallowedforurls', label: 'Local network access allowed for URLs', family: 'Google Chrome', category: 'Local network access' },
  { key: 'passwordmanagerenabled', label: 'Enable password manager', family: 'Browser', category: 'Passwords' },
  { key: 'popupsallowedforurls', label: 'Pop-ups allowed for URLs', family: 'Browser', category: 'Content settings' },
  { key: 'popupsblockedforurls', label: 'Pop-ups blocked for URLs', family: 'Browser', category: 'Content settings' },
  { key: 'safebrowsingenabled', label: 'Enable Safe Browsing', family: 'Browser', category: 'Security' },
  { key: 'smartscreenenabled', label: 'Enable SmartScreen', family: 'Microsoft Edge', category: 'Security' },
  { key: 'smartscreenpuaenabled', label: 'Block potentially unwanted apps with SmartScreen', family: 'Microsoft Edge', category: 'Security' },
  { key: 'allowtelemetry', label: 'Allow telemetry', family: 'Windows', category: 'Privacy' },
  { key: 'configureautomaticupdates', label: 'Configure automatic updates', family: 'Windows Update', category: 'Windows Update for Business' },
  { key: 'targetreleaseversion', label: 'Target release version', family: 'Windows Update', category: 'Windows Update for Business' },
  { key: 'targetreleaseversioninfo', label: 'Target release version info', family: 'Windows Update', category: 'Windows Update for Business' },
];

const pathFamilyHints: Array<[RegExp, { family: string; category: string }]> = [
  [/defender|antivirus|attack surface|asr/i, { family: 'Defender', category: 'Microsoft Defender' }],
  [/edge|microsoftedge/i, { family: 'Microsoft Edge', category: 'Browser policies' }],
  [/chrome|googlechrome|chromeintune/i, { family: 'Google Chrome', category: 'Browser policies' }],
  [/bitlocker/i, { family: 'BitLocker', category: 'Encryption' }],
  [/firewall/i, { family: 'Firewall', category: 'Network security' }],
  [/laps/i, { family: 'Windows LAPS', category: 'Local admin password' }],
  [/password|pin|credential/i, { family: 'Identity', category: 'Credentials' }],
  [/device lock|devicelock|lock screen/i, { family: 'Device Lock', category: 'Lock screen' }],
  [/update|quality update|feature update|wufb/i, { family: 'Windows Update', category: 'Windows Update for Business' }],
];

const commonValueLabels: Record<string, string> = {
  '0': 'Disabled / Not configured',
  '1': 'Enabled',
  '2': 'Audit / Warn',
  'true': 'Enabled',
  'false': 'Disabled',
  enabled: 'Enabled',
  disabled: 'Disabled',
  notconfigured: 'Not configured',
  blocked: 'Blocked',
  allowed: 'Allowed',
};

function splitEnumSuffix(value: string): string | null {
  const match = value.match(/_([0-9]+)$/);
  return match?.[1] ?? null;
}

export function normalizeCatalogKey(path: string): string {
  return (
    path
      .toLocaleLowerCase()
      .split(/[.~/_: -]+/)
      .filter(Boolean)
      .at(-1) ?? path.toLocaleLowerCase()
  );
}

const catalogMap = entries.reduce<Map<string, SettingCatalogEntry>>((map, entry) => {
  map.set(entry.key, entry);
  entry.aliases?.forEach((alias) => map.set(alias, entry));
  return map;
}, new Map<string, SettingCatalogEntry>());

function inferFamily(path: string): { family: string; category: string } {
  return pathFamilyHints.find(([pattern]) => pattern.test(path))?.[1] ?? { family: 'Intune', category: 'Intune setting' };
}

export function lookupSettingCatalog(path: string): SettingCatalogEntry | undefined {
  return catalogMap.get(normalizeCatalogKey(path));
}

export function describeCatalogSetting(path: string, fallbackName?: string): SettingDescription {
  const catalog = lookupSettingCatalog(path);
  if (catalog) {
    return {
      label: catalog.label,
      family: catalog.family,
      category: catalog.category,
      canonicalKey: catalog.key,
      isKnown: true,
    };
  }

  const inferred = inferFamily(path);
  const key = normalizeCatalogKey(path);
  const label = fallbackName && !/device_vendor_msft/i.test(fallbackName) ? fallbackName : humanizeSettingName(key);
  return {
    label: inferred.family === 'Intune' ? label : `${inferred.family}: ${label}`,
    family: inferred.family,
    category: inferred.category,
    canonicalKey: key,
    isKnown: false,
  };
}

export function semanticCatalogValue(path: string, value: JsonValue): JsonValue {
  const catalog = lookupSettingCatalog(path);
  if (catalog?.semanticValue) return catalog.semanticValue(value);

  if (typeof value === 'string') {
    const lower = value.toLocaleLowerCase();
    const suffix = splitEnumSuffix(lower);
    if (suffix && lower.includes(normalizeCatalogKey(path))) return suffix;
    return lower;
  }

  if (Array.isArray(value)) return value.map((item) => semanticCatalogValue(path, item));
  if (typeof value === 'number') return String(value);
  return value;
}

export function formatCatalogValue(path: string, value: JsonValue): string | undefined {
  const catalog = lookupSettingCatalog(path);
  if (catalog?.formatValue) return catalog.formatValue(value);

  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'number') {
    const readable = commonValueLabels[String(value)];
    return readable ? `${readable} (${value})` : undefined;
  }
  if (typeof value === 'string') {
    const suffix = splitEnumSuffix(value);
    const lookupKey = suffix ?? value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
    const readable = commonValueLabels[lookupKey];
    if (readable) return `${readable} (${value})`;
    if (normalizeCatalogKey(path) && value.toLocaleLowerCase().includes(normalizeCatalogKey(path))) {
      return humanizeSettingName(value);
    }
  }

  return undefined;
}
