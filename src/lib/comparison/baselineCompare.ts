import type { BaselineComparisonResult, TenantImport } from '../../types/tenantdiff';
import { compareTenants } from './policyMatcher';

export function compareAgainstBaseline(tenant: TenantImport, baseline: TenantImport): BaselineComparisonResult {
  const result = compareTenants(baseline, tenant, true);
  const found = result.summary.matchedPolicies + result.summary.possibleMatches;
  const totalBaselineSettings = result.summary.identicalSettings + result.summary.differentSettings + result.summary.missingInBSettings;
  const policyCoveragePercent = baseline.policies.length === 0 ? 0 : Math.round((found / baseline.policies.length) * 100);
  const settingCoveragePercent =
    totalBaselineSettings === 0 ? 0 : Math.round((result.summary.identicalSettings / totalBaselineSettings) * 100);
  const driftSettings = result.summary.differentSettings + result.summary.missingInBSettings;

  return {
    generatedAt: result.generatedAt,
    tenantName: tenant.tenantName,
    baselineName: baseline.tenantName,
    coveragePercent: settingCoveragePercent,
    policyCoveragePercent,
    settingCoveragePercent,
    baselinePolicies: baseline.policies.length,
    foundPolicies: found,
    missingPolicies: result.summary.onlyInA,
    extraTenantPolicies: result.summary.onlyInB,
    totalBaselineSettings,
    matchingSettings: result.summary.identicalSettings,
    differentSettings: result.summary.differentSettings,
    missingSettings: result.summary.missingInBSettings,
    driftSettings,
    unsupportedPolicies: result.summary.unsupportedPolicies,
    unresolvedMatches: result.summary.possibleMatches,
    compliantPolicies: result.summary.compliantPolicies,
    translatedSettings: result.summary.translatedSettings,
    unknownSettings: result.summary.unknownSettings,
    matches: result.matches,
  };
}
