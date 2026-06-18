import type { NormalizedPolicy, NormalizedSetting, SettingComparison } from '../../types/tenantdiff';
import { stableStringify } from '../../utils/stableJson';
import { describeSetting, semanticSettingValue } from '../normalization/settingDictionary';

function settingMap(settings: NormalizedSetting[]): Map<string, NormalizedSetting> {
  const map = new Map<string, NormalizedSetting>();
  settings.forEach((setting) => {
    if (!map.has(setting.normalizedPath)) {
      map.set(setting.normalizedPath, setting);
    }
  });
  return map;
}

export function compareSettings(policyA: NormalizedPolicy, policyB: NormalizedPolicy): SettingComparison[] {
  const left = settingMap(policyA.settings);
  const right = settingMap(policyB.settings);
  const keys = Array.from(new Set([...left.keys(), ...right.keys()])).sort();

  return keys.map((key) => {
    const tenantASetting = left.get(key);
    const tenantBSetting = right.get(key);
    const description = describeSetting(key, tenantASetting?.displayName ?? tenantBSetting?.displayName ?? key);
    const displayName = description.label;
    const isKnown = description.isKnown;

    if (!tenantASetting) {
      return {
        settingPath: key,
        displayName,
        isKnown,
        status: 'missingInA',
        tenantBValue: tenantBSetting?.value,
        tenantBSetting,
      };
    }

    if (!tenantBSetting) {
      return {
        settingPath: key,
        displayName,
        isKnown,
        status: 'missingInB',
        tenantAValue: tenantASetting.value,
        tenantASetting,
      };
    }

      return {
        settingPath: key,
        displayName,
        isKnown,
        status:
          stableStringify(semanticSettingValue(key, tenantASetting.value)) ===
          stableStringify(semanticSettingValue(key, tenantBSetting.value))
          ? 'identical'
          : 'different',
      tenantAValue: tenantASetting.value,
      tenantBValue: tenantBSetting.value,
      tenantASetting,
      tenantBSetting,
    };
  });
}
