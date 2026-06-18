import type { NormalizedPolicy, SearchResult } from '../../types/tenantdiff';
import { previewValue } from '../parsers/intuneJsonParser';

export function searchPolicies(policies: NormalizedPolicy[], query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const results: SearchResult[] = [];

  policies.forEach((policy) => {
    const policyText = `${policy.displayName} ${policy.normalizedName} ${policy.policyType}`.toLocaleLowerCase();
    if (policyText.includes(normalizedQuery)) {
      results.push({ policy, matchReason: 'Policy name or type', matchedField: 'policy', valuePreview: policy.displayName });
    }

    policy.settings.forEach((setting) => {
      const value = previewValue(setting.value);
      const nameMatch = setting.displayName.toLocaleLowerCase().includes(normalizedQuery);
      const pathMatch = setting.normalizedPath.toLocaleLowerCase().includes(normalizedQuery);
      const valueMatch = value.toLocaleLowerCase().includes(normalizedQuery);
      if (nameMatch) results.push({ policy, setting, matchReason: 'Setting label', matchedField: 'settingLabel', valuePreview: value });
      else if (pathMatch) results.push({ policy, setting, matchReason: 'Raw setting path', matchedField: 'rawPath', valuePreview: value });
      else if (valueMatch) results.push({ policy, setting, matchReason: 'Setting value', matchedField: 'value', valuePreview: value });
    });
  });

  return results.slice(0, 300);
}
