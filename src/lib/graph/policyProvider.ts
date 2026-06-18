import type { ImportDiagnostic, ImportIssue, ImportSourceDocument, NormalizedPolicy, TenantImport, TenantKey } from '../../types/tenantdiff';
import { parseTenantDocuments, parseTenantFiles } from '../parsers/intuneJsonParser';
import type { GraphToken } from './graphAuth';

export interface PolicyProviderInput {
  tenant: TenantKey;
  tenantName: string;
  prefix: string;
}

export interface IPolicyProvider {
  readonly kind: 'json' | 'graph';
  loadPolicies(input: PolicyProviderInput): Promise<TenantImport>;
}

export class JsonPolicyProvider implements IPolicyProvider {
  readonly kind = 'json' as const;

  constructor(private readonly files: File[]) {}

  async loadPolicies(input: PolicyProviderInput): Promise<TenantImport> {
    const parsed = await parseTenantFiles(this.files, input.tenant, input.tenantName, input.prefix);
    return {
      tenant: input.tenant,
      tenantName: input.tenantName,
      prefix: input.prefix,
      policies: parsed.policies,
      issues: parsed.issues,
      diagnostics: parsed.diagnostics,
      fileNames: parsed.fileNames,
    };
  }
}

export class GraphPolicyProvider implements IPolicyProvider {
  readonly kind = 'graph' as const;

  constructor(private readonly token: GraphToken, private readonly options: { includeAssignments?: boolean } = {}) {}

  async loadPolicies(input: PolicyProviderInput): Promise<TenantImport> {
    const issues: ImportIssue[] = [];
    const diagnostics: ImportDiagnostic[] = [];
    const documents = await fetchGraphSourceDocuments(this.token, issues, diagnostics, this.options.includeAssignments);
    const parsed = await parseTenantDocuments(documents, input.tenant, input.tenantName, input.prefix);

    return {
      tenant: input.tenant,
      tenantName: input.tenantName,
      prefix: input.prefix,
      policies: parsed.policies,
      issues: [...issues, ...parsed.issues],
      diagnostics: [...diagnostics, ...parsed.diagnostics],
      fileNames: parsed.fileNames,
    };
  }
}

const graphEndpoints = [
  {
    fileName: 'graph-settings-catalog-policies.json',
    url: '/beta/deviceManagement/configurationPolicies?$expand=settings',
    assignmentUrl: '/beta/deviceManagement/configurationPolicies?$expand=settings,assignments',
    label: 'Settings Catalog and security baseline policies',
  },
  {
    fileName: 'graph-device-configurations.json',
    url: '/v1.0/deviceManagement/deviceConfigurations',
    label: 'Device configuration profiles',
  },
  {
    fileName: 'graph-compliance-policies.json',
    url: '/v1.0/deviceManagement/deviceCompliancePolicies',
    label: 'Device compliance policies',
  },
  {
    fileName: 'graph-managed-app-policies.json',
    url: '/v1.0/deviceAppManagement/managedAppPolicies',
    label: 'App protection policies',
  },
] as const;

export async function fetchGraphSourceDocuments(
  token: GraphToken,
  issues: ImportIssue[] = [],
  diagnostics: ImportDiagnostic[] = [],
  includeAssignments = false,
): Promise<ImportSourceDocument[]> {
  const documents: ImportSourceDocument[] = [];

  for (const endpoint of graphEndpoints) {
    const requestUrl = includeAssignments && 'assignmentUrl' in endpoint ? endpoint.assignmentUrl : endpoint.url;
    try {
      const body = await graphGetCollection(token, requestUrl);
      const value = Array.isArray(body.value) ? body.value : [];
      documents.push({
        name: endpoint.fileName,
        text: JSON.stringify(body),
        size: JSON.stringify(body).length,
        sourceKind: 'graph',
        sourceRef: requestUrl,
      });
      diagnostics.push({
        sourceId: requestUrl,
        fileName: endpoint.fileName,
        sourceRef: requestUrl,
        sourceKind: 'graph',
        parser: 'policy-list',
        policyObjectsFound: value.length,
        policyCount: value.length,
        normalizedPolicies: value.length,
        settingCount: value.reduce<number>((total, item) => {
          const settings = typeof item === 'object' && item && 'settings' in item ? (item as { settings?: unknown }).settings : undefined;
          return total + (Array.isArray(settings) ? settings.length : 0);
        }, 0),
        skippedObjects: 0,
        unsupportedPolicies: 0,
        metadataOnlyPolicies: 0,
        duplicateGroups: [],
        confidence: value.length > 0 ? 'high' : 'medium',
        samplePolicies: [],
        warnings: [`Fetched from Microsoft Graph: ${endpoint.label}`],
        endpoint: requestUrl,
      });
    } catch (error) {
      issues.push({
        fileName: endpoint.fileName,
        severity: 'warning',
        message: error instanceof Error ? error.message : `Could not fetch ${endpoint.label}.`,
        source: 'graph',
        endpoint: requestUrl,
        sourceId: requestUrl,
      });
    }
  }

  if (includeAssignments) {
    issues.push({
      fileName: 'Microsoft Graph',
      severity: 'warning',
      message: 'Assignment payloads were requested. Raw assignment objects are included where Microsoft Graph returns them; group display-name resolution is not enabled without Directory.Read.All.',
      source: 'graph',
    });
  }

  return documents;
}

async function graphGetCollection(token: GraphToken, path: string): Promise<{ value: unknown[] }> {
  const values: unknown[] = [];
  let nextUrl: string | undefined = `https://graph.microsoft.com${path}`;

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        Accept: 'application/json',
      },
    });

    const rawBody = await response.text();
    let body: { value?: unknown[]; '@odata.nextLink'?: string; error?: { message?: string } } = {};
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      if (!response.ok) {
        throw new Error(`Graph request failed: ${response.status}. The response was not JSON.`);
      }
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error('Graph access was denied or the token expired. Reconnect to Microsoft Graph and try again.');
      }
      throw new Error(body.error?.message ?? `Graph request failed: ${response.status}`);
    }

    values.push(...(Array.isArray(body.value) ? body.value : []));
    nextUrl = body['@odata.nextLink'];
  }

  return { value: values };
}

export function emptyImport(tenant: TenantKey, tenantName: string): TenantImport {
  return { tenant, tenantName, prefix: '', policies: [] as NormalizedPolicy[], issues: [], diagnostics: [], fileNames: [] };
}
