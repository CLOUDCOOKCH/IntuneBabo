import type { BaselineComparisonResult, ImportSourceDocument, MatchDecisionMap, TenantComparisonResult, TenantImport, TenantKey } from './tenantdiff';

export interface ParseTenantPayload {
  tenant: TenantKey;
  tenantName: string;
  prefix: string;
  documents: ImportSourceDocument[];
}

export interface ParseImportsPayload {
  tenant: ParseTenantPayload;
  baseline: ParseTenantPayload;
}

export interface ComparisonPayload {
  tenant: TenantImport;
  baseline: TenantImport;
  fuzzyEnabled: boolean;
}

export interface ApplyMatchDecisionPayload extends ComparisonPayload {
  comparison: TenantComparisonResult;
  decisions: MatchDecisionMap;
}

export interface WorkerResultPayload {
  comparison: TenantComparisonResult;
  baselineResult: BaselineComparisonResult;
}

export type WorkerRequest =
  | { type: 'parse-imports'; requestId: string; payload: ParseImportsPayload }
  | { type: 'generate-comparison'; requestId: string; payload: ComparisonPayload }
  | { type: 'apply-match-decisions'; requestId: string; payload: ApplyMatchDecisionPayload };

export type WorkerResponse =
  | { type: 'progress'; requestId: string; stage: string; message: string }
  | { type: 'parse-imports:success'; requestId: string; payload: { tenant: TenantImport; baseline: TenantImport } }
  | { type: 'generate-comparison:success'; requestId: string; payload: WorkerResultPayload }
  | { type: 'apply-match-decisions:success'; requestId: string; payload: WorkerResultPayload }
  | { type: 'error'; requestId: string; message: string };
