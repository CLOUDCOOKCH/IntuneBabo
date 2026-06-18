import type { CandidatePolicyMatch, NormalizedPolicy, PolicyMatch, TenantComparisonResult, TenantImport } from '../../types/tenantdiff';
import { similarity } from '../normalization/policyName';
import { compareSettings } from './settingsCompare';

function scorePolicy(left: NormalizedPolicy, right: NormalizedPolicy): { confidence: number; reasons: string[] } {
  let confidence = similarity(left.normalizedName, right.normalizedName);
  const reasons = [`Name similarity ${Math.round(confidence * 100)}%`];

  if (left.normalizedName === right.normalizedName) {
    confidence = 1;
    reasons.push('Exact normalized name match');
  }

  if (left.policyType === right.policyType && left.policyType !== 'unknown') {
    confidence = Math.min(1, confidence + 0.08);
    reasons.push('Same policy type');
  }

  if (left.platform && right.platform && left.platform === right.platform) {
    confidence = Math.min(1, confidence + 0.05);
    reasons.push('Same platform');
  }

  return { confidence, reasons };
}

function matchId(left?: NormalizedPolicy, right?: NormalizedPolicy, normalizedName?: string): string {
  return `${left?.id ?? 'none'}::${right?.id ?? 'none'}::${normalizedName ?? ''}`;
}

function diffSummary(left: NormalizedPolicy, right: NormalizedPolicy): CandidatePolicyMatch['diffSummary'] {
  const settingComparisons = compareSettings(left, right);
  return {
    identical: settingComparisons.filter((item) => item.status === 'identical').length,
    different: settingComparisons.filter((item) => item.status === 'different').length,
    missingInTenant: settingComparisons.filter((item) => item.status === 'missingInB').length,
    extraInTenant: settingComparisons.filter((item) => item.status === 'missingInA').length,
  };
}

export function compareTenants(tenantA: TenantImport, tenantB: TenantImport, fuzzyEnabled: boolean): TenantComparisonResult {
  const unmatchedB = new Set(tenantB.policies);
  const matches: PolicyMatch[] = [];
  const candidateTenantIds = new Set<string>();

  for (const policyA of tenantA.policies) {
    const exact = tenantB.policies.find((policyB) => unmatchedB.has(policyB) && policyB.normalizedName === policyA.normalizedName);

    if (exact) {
      unmatchedB.delete(exact);
      matches.push({
        id: matchId(policyA, exact),
        status: 'matched',
        policyA,
        policyB: exact,
        normalizedName: policyA.normalizedName,
        confidence: 1,
        reasons: ['Exact normalized name match'],
        settingComparisons: compareSettings(policyA, exact),
        candidateMatches: [],
      });
      continue;
    }

    const candidates = fuzzyEnabled
      ? tenantB.policies
          .filter((policyB) => unmatchedB.has(policyB))
          .map((policyB) => ({ policyB, ...scorePolicy(policyA, policyB) }))
          .filter((candidate) => candidate.confidence >= 0.55)
          .sort((left, right) => right.confidence - left.confidence)
          .slice(0, 5)
      : [];

    if (candidates.length > 0) {
      const candidateMatches: CandidatePolicyMatch[] = candidates.map((candidate) => {
        candidateTenantIds.add(candidate.policyB.id);
        return {
          tenantPolicyId: candidate.policyB.id,
          tenantPolicyName: candidate.policyB.displayName,
          tenantNormalizedName: candidate.policyB.normalizedName,
          confidence: candidate.confidence,
          reasons: candidate.reasons,
          policyType: candidate.policyB.policyType,
          platform: candidate.policyB.platform,
          diffSummary: diffSummary(policyA, candidate.policyB),
        };
      });
      matches.push({
        id: matchId(policyA, undefined, policyA.normalizedName),
        status: 'possible',
        policyA,
        normalizedName: policyA.normalizedName,
        confidence: candidateMatches[0]?.confidence ?? 0,
        reasons: candidateMatches[0]?.reasons ?? ['Possible tenant policy candidates found'],
        settingComparisons: [],
        candidateMatches,
      });
      continue;
    }

    matches.push({
      id: matchId(policyA, undefined, policyA.normalizedName),
      status: 'onlyInA',
      policyA,
      normalizedName: policyA.normalizedName,
      confidence: 0,
      reasons: ['No matching policy found in Tenant B'],
      settingComparisons: [],
      candidateMatches: [],
    });
  }

  unmatchedB.forEach((policyB) => {
    if (candidateTenantIds.has(policyB.id)) return;
    matches.push({
      id: matchId(undefined, policyB, policyB.normalizedName),
      status: 'onlyInB',
      policyB,
      normalizedName: policyB.normalizedName,
      confidence: 0,
      reasons: ['No matching policy found in Tenant A'],
      settingComparisons: [],
      candidateMatches: [],
    });
  });

  const summary = matches.reduce(
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
      totalTenantA: tenantA.policies.length,
      totalTenantB: tenantB.policies.length,
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

  return {
    generatedAt: new Date().toISOString(),
    tenantAName: tenantA.tenantName,
    tenantBName: tenantB.tenantName,
    summary,
    matches,
    issues: [...tenantA.issues, ...tenantB.issues],
  };
}
