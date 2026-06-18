import { baselineMetricsFromComparison, applyMatchDecisionsToComparison } from './comparisonEngine';
import { compareTenants } from './policyMatcher';
import { parseTenantDocuments } from '../parsers/intuneJsonParser';
import type { ApplyMatchDecisionPayload, ComparisonPayload, ParseImportsPayload, WorkerResultPayload } from '../../types/worker';
import type { TenantImport } from '../../types/tenantdiff';

export async function runParseImportsTask(
  payload: ParseImportsPayload,
  onProgress?: (stage: string, message: string) => void,
): Promise<{ tenant: TenantImport; baseline: TenantImport }> {
  onProgress?.('tenant-parse', `Parsing ${payload.tenant.documents.length} tenant source(s)`);
  const tenant = await parseTenantDocuments(
    payload.tenant.documents,
    payload.tenant.tenant,
    payload.tenant.tenantName,
    payload.tenant.prefix,
  );
  onProgress?.('baseline-parse', `Parsing ${payload.baseline.documents.length} baseline source(s)`);
  const baseline = await parseTenantDocuments(
    payload.baseline.documents,
    payload.baseline.tenant,
    payload.baseline.tenantName,
    payload.baseline.prefix,
  );
  return {
    tenant: {
      tenant: payload.tenant.tenant,
      tenantName: payload.tenant.tenantName,
      prefix: payload.tenant.prefix,
      policies: tenant.policies,
      issues: tenant.issues,
      diagnostics: tenant.diagnostics,
      fileNames: tenant.fileNames,
    },
    baseline: {
      tenant: payload.baseline.tenant,
      tenantName: payload.baseline.tenantName,
      prefix: payload.baseline.prefix,
      policies: baseline.policies,
      issues: baseline.issues,
      diagnostics: baseline.diagnostics,
      fileNames: baseline.fileNames,
    },
  };
}

export function runGenerateComparisonTask(
  payload: ComparisonPayload,
  onProgress?: (stage: string, message: string) => void,
): WorkerResultPayload {
  onProgress?.('matching', 'Generating policy matches');
  const comparison = compareTenants(payload.baseline, payload.tenant, payload.fuzzyEnabled);
  onProgress?.('assessment', 'Building assessment summary');
  const baselineResult = baselineMetricsFromComparison(comparison, payload.baseline, payload.tenant);
  return { comparison, baselineResult };
}

export function runApplyMatchDecisionsTask(
  payload: ApplyMatchDecisionPayload,
  onProgress?: (stage: string, message: string) => void,
): WorkerResultPayload {
  onProgress?.('decisions', 'Applying saved or manual match decisions');
  const comparison = applyMatchDecisionsToComparison(payload.comparison, payload.baseline, payload.tenant, payload.decisions);
  const baselineResult = baselineMetricsFromComparison(comparison, payload.baseline, payload.tenant);
  return { comparison, baselineResult };
}
