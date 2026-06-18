import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { PolicyMatch, TenantImport } from '../../types/tenantdiff';

export function MatchReviewPanel({
  matches,
  tenantPolicies,
  onAccept,
  onManual,
  onReject,
}: {
  matches: PolicyMatch[];
  tenantPolicies: TenantImport['policies'];
  onAccept: (baselinePolicyId: string, tenantPolicyId: string) => void;
  onManual: (baselinePolicyId: string, tenantPolicyId: string) => void;
  onReject: (baselinePolicyId: string) => void;
}) {
  const reviewMatches = matches.filter((match) => match.status === 'possible' || (match.status === 'onlyInA' && match.candidateMatches.length > 0));

  return (
    <Card className="glass-panel">
      <CardHeader>
        <CardTitle>Review match candidates</CardTitle>
        <CardDescription>Accept, remap, or reject low-confidence policy matches before presenting the final assessment.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {reviewMatches.length === 0 ? (
          <div className="rounded-md border p-4 text-sm text-muted-foreground">No unresolved candidate matches remain.</div>
        ) : (
          reviewMatches.map((match) => (
            <div className="rounded-lg border bg-card p-4 shadow-sm" key={match.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{match.policyA?.displayName ?? match.normalizedName}</div>
                  <div className="text-xs text-muted-foreground">{match.normalizedName}</div>
                </div>
                <Badge variant="warning">{match.candidateMatches.length} candidates</Badge>
              </div>

              <div className="mt-3 space-y-3">
                {match.candidateMatches.map((candidate) => (
                  <div className="rounded-md border p-3" key={`${match.id}-${candidate.tenantPolicyId}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">{candidate.tenantPolicyName}</div>
                        <div className="text-xs text-muted-foreground">
                          {candidate.tenantNormalizedName} · {candidate.policyType}
                          {candidate.platform ? ` · ${candidate.platform}` : ''}
                        </div>
                      </div>
                      <Badge variant={candidate.confidence >= 0.8 ? 'success' : 'warning'}>
                        {Math.round(candidate.confidence * 100)}%
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">{candidate.diffSummary.identical} matching</Badge>
                      <Badge variant={candidate.diffSummary.different > 0 ? 'warning' : 'secondary'}>
                        {candidate.diffSummary.different} different
                      </Badge>
                      <Badge variant={candidate.diffSummary.missingInTenant > 0 ? 'destructive' : 'secondary'}>
                        {candidate.diffSummary.missingInTenant} missing in tenant
                      </Badge>
                      <Badge variant={candidate.diffSummary.extraInTenant > 0 ? 'warning' : 'secondary'}>
                        {candidate.diffSummary.extraInTenant} extra tenant settings
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {candidate.reasons.map((reason) => (
                        <span key={`${candidate.tenantPolicyId}-${reason}`}>{reason}</span>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button className="h-8 px-3" onClick={() => match.policyA && onAccept(match.policyA.id, candidate.tenantPolicyId)}>
                        Accept candidate
                      </Button>
                      <Button className="h-8 px-3" variant="outline" onClick={() => match.policyA && onManual(match.policyA.id, candidate.tenantPolicyId)}>
                        Force map
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-md border bg-sky-50/70 p-3">
                <label className="space-y-1 text-sm font-semibold">
                  Map to another tenant policy
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value && match.policyA) onManual(match.policyA.id, event.target.value);
                    }}
                  >
                    <option value="">Select tenant policy...</option>
                    {tenantPolicies.map((policy) => (
                      <option key={policy.id} value={policy.id}>
                        {policy.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <Button className="mt-3 h-8 px-3" variant="ghost" onClick={() => match.policyA && onReject(match.policyA.id)}>
                  Keep unmatched
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
