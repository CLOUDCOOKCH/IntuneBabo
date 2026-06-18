import type { JsonObject, JsonValue } from './intune';

export type TenantKey = 'A' | 'B' | 'Baseline';
export type ImportSourceKind = 'json' | 'graph';

export type PolicyType =
  | 'settingsCatalog'
  | 'deviceConfiguration'
  | 'compliancePolicy'
  | 'appProtection'
  | 'securityBaseline'
  | 'unknown';

export interface NormalizedSetting {
  id: string;
  displayName: string;
  normalizedPath: string;
  value: JsonValue;
  valueType: string;
  source: string;
  raw: JsonValue;
}

export interface NormalizedPolicy {
  id: string;
  displayName: string;
  normalizedName: string;
  sourceTenant: TenantKey;
  sourceKind: ImportSourceKind;
  sourceRef: string;
  policyType: PolicyType;
  description?: string;
  platform?: string;
  technologies?: string;
  assignments: JsonValue[];
  settings: NormalizedSetting[];
  rawJson: JsonObject;
  sourceFile: string;
  warnings: string[];
  isMetadataOnly?: boolean;
  isUnsupported?: boolean;
}

export interface ImportIssue {
  fileName: string;
  severity: 'warning' | 'error';
  message: string;
  details?: string[];
  source?: ImportSourceKind;
  endpoint?: string;
  sourceId?: string;
}

export interface ImportDiagnostic {
  sourceId: string;
  fileName: string;
  sourceRef: string;
  sourceKind: ImportSourceKind;
  parser: 'policy-list' | 'single-policy' | 'settings-collection' | 'fallback';
  policyObjectsFound: number;
  policyCount: number;
  normalizedPolicies: number;
  settingCount: number;
  skippedObjects: number;
  unsupportedPolicies: number;
  metadataOnlyPolicies: number;
  duplicateGroups: string[];
  confidence: 'high' | 'medium' | 'low';
  samplePolicies: {
    displayName: string;
    normalizedName: string;
    policyType: PolicyType;
    settingCount: number;
    sampleSettings: {
      displayName: string;
      path: string;
      valuePreview: string;
    }[];
  }[];
  warnings: string[];
  endpoint?: string;
}

export interface TenantImport {
  tenant: TenantKey;
  tenantName: string;
  prefix: string;
  policies: NormalizedPolicy[];
  issues: ImportIssue[];
  diagnostics: ImportDiagnostic[];
  fileNames: string[];
}

export interface CandidatePolicyMatch {
  tenantPolicyId: string;
  tenantPolicyName: string;
  tenantNormalizedName: string;
  confidence: number;
  reasons: string[];
  policyType: PolicyType;
  platform?: string;
  diffSummary: {
    identical: number;
    different: number;
    missingInTenant: number;
    extraInTenant: number;
  };
}

export interface MatchDecision {
  baselinePolicyName: string;
  tenantPolicyId?: string;
  tenantPolicyName?: string;
  action: 'accept' | 'manual' | 'reject';
}

export type MatchDecisionMap = Record<string, MatchDecision>;

export interface PolicyMatch {
  id: string;
  status: 'matched' | 'onlyInA' | 'onlyInB' | 'possible';
  policyA?: NormalizedPolicy;
  policyB?: NormalizedPolicy;
  normalizedName: string;
  confidence: number;
  reasons: string[];
  settingComparisons: SettingComparison[];
  candidateMatches: CandidatePolicyMatch[];
}

export interface SettingComparison {
  settingPath: string;
  displayName: string;
  isKnown: boolean;
  status: 'identical' | 'different' | 'missingInA' | 'missingInB' | 'unknown';
  tenantAValue?: JsonValue;
  tenantBValue?: JsonValue;
  tenantASetting?: NormalizedSetting;
  tenantBSetting?: NormalizedSetting;
}

export interface ComparisonSummaryV2 {
  totalTenantA: number;
  totalTenantB: number;
  matchedPolicies: number;
  possibleMatches: number;
  onlyInA: number;
  onlyInB: number;
  identicalSettings: number;
  differentSettings: number;
  missingInASettings: number;
  missingInBSettings: number;
  unsupportedPolicies: number;
  driftPolicies: number;
  compliantPolicies: number;
  translatedSettings: number;
  unknownSettings: number;
}

export interface TenantComparisonResult {
  generatedAt: string;
  tenantAName: string;
  tenantBName: string;
  summary: ComparisonSummaryV2;
  matches: PolicyMatch[];
  issues: ImportIssue[];
}

export type AssessmentStatus = 'unsupported' | 'missingPolicy' | 'review' | 'drift' | 'compliant' | 'extra';

export interface BaselineComparisonResult {
  generatedAt: string;
  tenantName: string;
  baselineName: string;
  coveragePercent: number;
  policyCoveragePercent: number;
  settingCoveragePercent: number;
  baselinePolicies: number;
  foundPolicies: number;
  missingPolicies: number;
  extraTenantPolicies: number;
  totalBaselineSettings: number;
  matchingSettings: number;
  differentSettings: number;
  missingSettings: number;
  driftSettings: number;
  unsupportedPolicies: number;
  unresolvedMatches: number;
  compliantPolicies: number;
  translatedSettings: number;
  unknownSettings: number;
  matches: PolicyMatch[];
}

export interface SearchResult {
  policy: NormalizedPolicy;
  setting?: NormalizedSetting;
  matchReason: string;
  matchedField: 'policy' | 'settingLabel' | 'rawPath' | 'value';
  valuePreview: string;
}

export interface AppNotice {
  id: string;
  tone: 'error' | 'warning' | 'success' | 'info';
  message: string;
}

export interface ImportSourceDocument {
  name: string;
  text: string;
  size: number;
  sourceKind: ImportSourceKind;
  sourceRef: string;
}
