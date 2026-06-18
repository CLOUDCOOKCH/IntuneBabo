import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { ImportDiagnostic, ImportIssue, NormalizedPolicy } from '../../types/tenantdiff';

function confidenceVariant(confidence: ImportDiagnostic['confidence']) {
  if (confidence === 'high') return 'success';
  if (confidence === 'medium') return 'warning';
  return 'destructive';
}

export function ImportReviewPanel({
  title,
  diagnostics,
  issues,
  policies,
  excludedPolicyIds,
  onTogglePolicy,
}: {
  title: string;
  diagnostics: ImportDiagnostic[];
  issues: ImportIssue[];
  policies: NormalizedPolicy[];
  excludedPolicyIds: string[];
  onTogglePolicy: (policyId: string) => void;
}) {
  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Review how each source was parsed before running a comparison.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {diagnostics.map((diagnostic) => (
          <div className="rounded-lg border bg-card p-4 shadow-sm" key={`${diagnostic.sourceId}-${diagnostic.fileName}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{diagnostic.fileName}</div>
                <div className="text-xs text-muted-foreground">
                  {diagnostic.sourceKind} · {diagnostic.sourceRef}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{diagnostic.parser}</Badge>
                <Badge variant={confidenceVariant(diagnostic.confidence)}>{diagnostic.confidence} confidence</Badge>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-md border p-2">Objects found: <strong>{diagnostic.policyObjectsFound}</strong></div>
              <div className="rounded-md border p-2">Policies normalized: <strong>{diagnostic.normalizedPolicies}</strong></div>
              <div className="rounded-md border p-2">Settings extracted: <strong>{diagnostic.settingCount}</strong></div>
              <div className="rounded-md border p-2">Skipped objects: <strong>{diagnostic.skippedObjects}</strong></div>
              <div className="rounded-md border p-2">Unsupported: <strong>{diagnostic.unsupportedPolicies}</strong></div>
              <div className="rounded-md border p-2">Metadata only: <strong>{diagnostic.metadataOnlyPolicies}</strong></div>
            </div>
            {diagnostic.duplicateGroups.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {diagnostic.duplicateGroups.map((group) => (
                  <Badge key={group} variant="warning">
                    Duplicate normalized name: {group}
                  </Badge>
                ))}
              </div>
            ) : null}
            {diagnostic.warnings.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200">
                {diagnostic.warnings.map((warning) => (
                  <li key={`${diagnostic.sourceId}-${warning}`}>{warning}</li>
                ))}
              </ul>
            ) : null}
            {diagnostic.samplePolicies.length > 0 ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-primary">Policy preview</summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1">Display name</th>
                        <th className="px-2 py-1">Normalized</th>
                        <th className="px-2 py-1">Type</th>
                        <th className="px-2 py-1">Settings</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostic.samplePolicies.map((policy) => (
                        <tr className="border-t" key={`${diagnostic.sourceId}-${policy.normalizedName}`}>
                          <td className="px-2 py-2 font-medium">{policy.displayName}</td>
                          <td className="px-2 py-2 text-muted-foreground">{policy.normalizedName}</td>
                          <td className="px-2 py-2">{policy.policyType}</td>
                          <td className="px-2 py-2">{policy.settingCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ) : null}
          </div>
        ))}

        {issues.length > 0 ? (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div className="rounded-md border p-3 text-sm" key={`${issue.sourceId ?? issue.fileName}-${issue.message}`}>
                <Badge variant={issue.severity === 'error' ? 'destructive' : 'warning'}>{issue.severity}</Badge>{' '}
                <strong>{issue.fileName}</strong>: {issue.message}
                {issue.details?.length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {issue.details.map((detail) => (
                      <li key={`${issue.fileName}-${detail}`}>{detail}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Policies in scope</div>
            <div className="text-xs text-muted-foreground">
              {policies.length - excludedPolicyIds.length} active · {excludedPolicyIds.length} excluded
            </div>
          </div>
          <div className="max-h-[480px] space-y-2 overflow-auto">
            {policies.map((policy) => {
              const excluded = excludedPolicyIds.includes(policy.id);
              return (
                <div className={`rounded-md border p-3 ${excluded ? 'bg-muted/60 opacity-75' : 'bg-card'}`} key={policy.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{policy.displayName}</div>
                      <div className="text-xs text-muted-foreground">{policy.normalizedName}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <Badge variant="secondary">{policy.policyType}</Badge>
                        <Badge variant="secondary">{policy.settings.length} settings</Badge>
                        {policy.isUnsupported ? <Badge variant="warning">unsupported</Badge> : null}
                        {policy.isMetadataOnly ? <Badge variant="warning">metadata only</Badge> : null}
                      </div>
                    </div>
                    <Button className="h-8 px-3" variant={excluded ? 'outline' : 'ghost'} onClick={() => onTogglePolicy(policy.id)}>
                      {excluded ? 'Include' : 'Exclude'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
