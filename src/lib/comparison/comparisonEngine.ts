import type {
  BaselineComparisonResult,
  MatchDecisionMap,
  PolicyMatch,
  TenantComparisonResult,
  TenantImport,
} from '../../types/tenantdiff';
import { compareSettings } from './settingsCompare';
import { summarizeMatches } from './matchSummary';

export { summarizeMatches } from './matchSummary';

export function baselineMetricsFromComparison(
  comparison: TenantComparisonResult,
  baseline: TenantImport,
  tenant: TenantImport,
): BaselineComparisonResult {
  const summary = comparison.summary;
  const totalBaselineSettings = summary.identicalSettings + summary.differentSettings + summary.missingInBSettings;
  const foundPolicies = summary.matchedPolicies + summary.possibleMatches;
  const settingCoveragePercent = totalBaselineSettings === 0 ? 0 : Math.round((summary.identicalSettings / totalBaselineSettings) * 100);

  return {
    generatedAt: comparison.generatedAt,
    tenantName: tenant.tenantName,
    baselineName: baseline.tenantName,
    coveragePercent: settingCoveragePercent,
    policyCoveragePercent: baseline.policies.length === 0 ? 0 : Math.round((foundPolicies / baseline.policies.length) * 100),
    settingCoveragePercent,
    baselinePolicies: baseline.policies.length,
    foundPolicies,
    missingPolicies: summary.onlyInA,
    extraTenantPolicies: summary.onlyInB,
    totalBaselineSettings,
    matchingSettings: summary.identicalSettings,
    differentSettings: summary.differentSettings,
    missingSettings: summary.missingInBSettings,
    driftSettings: summary.differentSettings + summary.missingInBSettings,
    unsupportedPolicies: summary.unsupportedPolicies,
    unresolvedMatches: summary.possibleMatches,
    compliantPolicies: summary.compliantPolicies,
    translatedSettings: summary.translatedSettings,
    unknownSettings: summary.unknownSettings,
    matches: comparison.matches,
  };
}

export function applyMatchDecisionsToComparison(
  comparison: TenantComparisonResult,
  baseline: TenantImport,
  tenant: TenantImport,
  decisions: MatchDecisionMap,
): TenantComparisonResult {
  let matches = comparison.matches.map((match) => ({ ...match, candidateMatches: [...match.candidateMatches] })) as Array<PolicyMatch | null>;
  const consumedTenantIds = new Set<string>();

  Object.entries(decisions).forEach(([baselinePolicyName, decision]) => {
    const baselinePolicy = baseline.policies.find((policy) => policy.normalizedName === baselinePolicyName);
    if (!baselinePolicy) return;

    if (decision.action === 'reject') {
      matches = matches.map((match) =>
        !match
          ? null
          : match.policyA?.normalizedName === baselinePolicyName
            ? {
                ...match,
                id: `${baselinePolicy.id}::none::decision-rejected`,
                status: 'onlyInA' as const,
                normalizedName: baselinePolicy.normalizedName,
                policyB: undefined,
                confidence: 0,
                reasons: ['Suggested match rejected by saved decision'],
                settingComparisons: [],
                candidateMatches: [],
              }
            : match,
      );
      return;
    }

    const tenantPolicy = tenant.policies.find(
      (policy) => policy.id === decision.tenantPolicyId || policy.normalizedName === decision.tenantPolicyName,
    );
    if (!tenantPolicy) return;
    consumedTenantIds.add(tenantPolicy.id);

    matches = matches
      .map((match) =>
        !match
          ? null
          : match.policyA?.normalizedName === baselinePolicyName
            ? {
                ...match,
                id: `${baselinePolicy.id}::${tenantPolicy.id}::decision-manual`,
                status: 'matched' as const,
                normalizedName: baselinePolicy.normalizedName,
                policyB: tenantPolicy,
                confidence: 1,
                reasons: [decision.action === 'accept' ? 'Accepted suggested match' : 'Manual match from saved decision'],
                settingComparisons: compareSettings(baselinePolicy, tenantPolicy),
                candidateMatches: [],
              }
            : match,
      )
      .map((match) => {
        if (!match) return null;
        if (match.policyA?.normalizedName === baselinePolicyName) return match;
        if (match.policyB?.id === tenantPolicy.id) {
          if (!match.policyA) return null;
          return {
            ...match,
            id: `${match.policyA.id}::none::decision-unmatched`,
            status: 'onlyInA' as const,
            normalizedName: match.policyA.normalizedName,
            policyB: undefined,
            confidence: 0,
            reasons: ['Tenant policy was assigned by saved decision to another baseline policy'],
            settingComparisons: [],
            candidateMatches: [],
          };
        }
        if (match.status !== 'possible') return match;
        const nextCandidates = match.candidateMatches.filter((candidate) => candidate.tenantPolicyId !== tenantPolicy.id);
        if (nextCandidates.length === 0) {
          return {
            ...match,
            id: `${match.policyA?.id ?? 'none'}::none::no-candidates`,
            status: 'onlyInA' as const,
            normalizedName: match.policyA?.normalizedName ?? match.normalizedName,
            policyB: undefined,
            confidence: 0,
            reasons: ['No candidate policies remain after applying saved decisions'],
            settingComparisons: [],
            candidateMatches: [],
          };
        }
        return {
          ...match,
          confidence: nextCandidates[0]?.confidence ?? match.confidence,
          reasons: nextCandidates[0]?.reasons ?? match.reasons,
          candidateMatches: nextCandidates,
        };
      });
  });

  const compactMatches = matches.filter((match): match is PolicyMatch => match !== null).filter((match) => {
    if (match.status !== 'onlyInB') return true;
    return !match.policyB || !consumedTenantIds.has(match.policyB.id);
  });

  return {
    ...comparison,
    matches: compactMatches,
    summary: summarizeMatches(compactMatches, baseline.policies.length, tenant.policies.length),
  };
}
