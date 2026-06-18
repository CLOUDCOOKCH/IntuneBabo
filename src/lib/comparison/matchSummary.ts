import type { PolicyMatch, TenantComparisonResult } from '../../types/tenantdiff';

export function summarizeMatches(
  matches: PolicyMatch[],
  baselinePolicyCount: number,
  tenantPolicyCount: number,
): TenantComparisonResult['summary'] {
  return matches.reduce(
    (acc, match) => {
      if (match.status === 'matched') acc.matchedPolicies += 1;
      if (match.status === 'possible') acc.possibleMatches += 1;
      if (match.status === 'onlyInA') acc.onlyInA += 1;
      if (match.status === 'onlyInB') acc.onlyInB += 1;
      const unsupported =
        match.settingComparisons.length === 0 &&
        [match.policyA, match.policyB].some((policy) => policy?.warnings.some((warning) => warning.includes('No comparable settings')));
      if (unsupported) acc.unsupportedPolicies += 1;
      if (match.status === 'matched' && !unsupported) {
        const hasDrift = match.settingComparisons.some((setting) => setting.status === 'different' || setting.status === 'missingInB');
        if (hasDrift) acc.driftPolicies += 1;
        else if (match.settingComparisons.length > 0) acc.compliantPolicies += 1;
      }
      match.settingComparisons.forEach((setting) => {
        if (setting.status === 'identical') acc.identicalSettings += 1;
        if (setting.status === 'different') acc.differentSettings += 1;
        if (setting.status === 'missingInA') acc.missingInASettings += 1;
        if (setting.status === 'missingInB') acc.missingInBSettings += 1;
        if (setting.isKnown) acc.translatedSettings += 1;
        else acc.unknownSettings += 1;
      });
      return acc;
    },
    {
      totalTenantA: baselinePolicyCount,
      totalTenantB: tenantPolicyCount,
      matchedPolicies: 0,
      possibleMatches: 0,
      onlyInA: 0,
      onlyInB: 0,
      identicalSettings: 0,
      differentSettings: 0,
      missingInASettings: 0,
      missingInBSettings: 0,
      unsupportedPolicies: 0,
      driftPolicies: 0,
      compliantPolicies: 0,
      translatedSettings: 0,
      unknownSettings: 0,
    },
  );
}
