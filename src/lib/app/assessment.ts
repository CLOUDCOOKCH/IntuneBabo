import type { AssessmentStatus, PolicyMatch, TenantImport } from '../../types/tenantdiff';

export type CompareFilter = 'all' | AssessmentStatus;

export function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'matched' || status === 'identical' || status === 'compliant') return 'success';
  if (status === 'possible' || status === 'different' || status === 'review' || status === 'drift') return 'warning';
  if (status.includes('missing') || status.includes('only') || status === 'unsupported') return 'destructive';
  return 'secondary';
}

export function hasNoComparableSettings(match: PolicyMatch): boolean {
  return (
    match.settingComparisons.length === 0 &&
    [match.policyA, match.policyB].some((policy) => policy?.warnings.some((warning) => warning.includes('No comparable settings')))
  );
}

export function assessmentStatus(match: PolicyMatch): AssessmentStatus {
  if (hasNoComparableSettings(match)) return 'unsupported';
  if (match.status === 'onlyInA') return 'missingPolicy';
  if (match.status === 'onlyInB') return 'extra';
  if (match.status === 'possible') return 'review';
  if (match.settingComparisons.some((setting) => setting.status === 'different' || setting.status === 'missingInB')) return 'drift';
  return 'compliant';
}

export function assessmentLabel(status: AssessmentStatus): string {
  if (status === 'missingPolicy') return 'Missing baseline policy';
  if (status === 'extra') return 'Extra tenant policy';
  if (status === 'review') return 'Review candidate';
  if (status === 'drift') return 'Confirmed drift';
  if (status === 'unsupported') return 'Unsupported or incomplete';
  return 'Compliant';
}

export function matchSettingCounts(match: PolicyMatch) {
  return {
    matching: match.settingComparisons.filter((setting) => setting.status === 'identical').length,
    different: match.settingComparisons.filter((setting) => setting.status === 'different').length,
    missingInTenant: match.settingComparisons.filter((setting) => setting.status === 'missingInB').length,
  };
}

export function canRunComparison(tenant: TenantImport, baseline: TenantImport): boolean {
  const hardErrors = [...tenant.issues, ...baseline.issues].some((issue) => issue.severity === 'error');
  return !hardErrors && tenant.policies.length > 0 && baseline.policies.length > 0;
}
