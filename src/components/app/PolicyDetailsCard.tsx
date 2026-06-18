import { useState } from 'react';
import { Copy } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import type { PolicyMatch, SettingComparison, TenantImport } from '../../types/tenantdiff';
import { formatSettingValue } from '../../lib/normalization/settingDictionary';
import { copyText } from '../../utils/clipboard';

type SettingFilter = 'all' | 'drift' | 'different' | 'missingInTenant' | 'extraInTenant' | 'matching';

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (status === 'matched' || status === 'identical') return 'success';
  if (status === 'possible' || status === 'different') return 'warning';
  if (status.includes('missing') || status.includes('only')) return 'destructive';
  return 'secondary';
}

function settingStatusLabel(status: SettingComparison['status']): string {
  const labels: Record<SettingComparison['status'], string> = {
    identical: 'Matching',
    different: 'Different value',
    missingInA: 'Extra tenant setting',
    missingInB: 'Missing in tenant',
    unknown: 'Unsupported',
  };
  return labels[status];
}

function businessPolicyStatus(match: PolicyMatch): string {
  if (match.status === 'onlyInA') return 'missing baseline policy';
  if (match.status === 'onlyInB') return 'extra tenant policy';
  if (match.status === 'possible') return 'review candidate';
  return 'found';
}

function settingCounts(match: PolicyMatch) {
  return {
    matching: match.settingComparisons.filter((setting) => setting.status === 'identical').length,
    different: match.settingComparisons.filter((setting) => setting.status === 'different').length,
    missingInTenant: match.settingComparisons.filter((setting) => setting.status === 'missingInB').length,
    extraInTenant: match.settingComparisons.filter((setting) => setting.status === 'missingInA').length,
  };
}

function visibleSettings(settings: SettingComparison[], filter: SettingFilter, query: string): SettingComparison[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return settings.filter((setting) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'drift' && (setting.status === 'different' || setting.status === 'missingInB')) ||
      (filter === 'different' && setting.status === 'different') ||
      (filter === 'missingInTenant' && setting.status === 'missingInB') ||
      (filter === 'extraInTenant' && setting.status === 'missingInA') ||
      (filter === 'matching' && setting.status === 'identical');
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    return `${setting.displayName} ${setting.settingPath} ${formatSettingValue(setting.settingPath, setting.tenantAValue)} ${formatSettingValue(
      setting.settingPath,
      setting.tenantBValue,
    )}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

function SettingRows({
  settings,
  leftLabel,
  rightLabel,
  settingFilter,
  settingQuery,
  onNotice,
}: {
  settings: SettingComparison[];
  leftLabel: string;
  rightLabel: string;
  settingFilter: SettingFilter;
  settingQuery: string;
  onNotice: (tone: 'error' | 'success', message: string) => void;
}) {
  const visible = visibleSettings(settings, settingFilter, settingQuery);
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No visible setting drift in this policy for the current filter.</p>;

  return (
    <div className="space-y-3">
      {visible.map((setting) => (
        <div className="rounded-lg border bg-card p-4 shadow-sm" key={setting.settingPath}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold">{setting.displayName}</div>
              <code className="text-xs text-muted-foreground">{setting.settingPath}</code>
            </div>
            <div className="flex gap-2">
              <Badge variant={statusVariant(setting.status)}>{settingStatusLabel(setting.status)}</Badge>
              <Button
                className="h-8 px-2"
                variant="outline"
                onClick={async () => {
                  const result = await copyText(setting.settingPath);
                  onNotice(result.ok ? 'success' : 'error', result.message);
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{leftLabel}</div>
              <pre className="min-h-16 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-50">
                {formatSettingValue(setting.settingPath, setting.tenantAValue)}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{rightLabel}</div>
              <pre className="min-h-16 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-50">
                {formatSettingValue(setting.settingPath, setting.tenantBValue)}
              </pre>
            </div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Raw setting JSON</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
              {JSON.stringify({ tenantA: setting.tenantASetting?.raw, tenantB: setting.tenantBSetting?.raw }, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}

export function PolicyDetailsCard({
  match,
  leftLabel,
  rightLabel,
  tenantPolicies,
  onManualMatch,
  onRejectMatch,
  onNotice,
}: {
  match: PolicyMatch;
  leftLabel: string;
  rightLabel: string;
  tenantPolicies: TenantImport['policies'];
  onManualMatch: (baselinePolicyId: string, tenantPolicyId: string) => void;
  onRejectMatch: (baselinePolicyId: string) => void;
  onNotice: (tone: 'error' | 'success', message: string) => void;
}) {
  const [settingFilter, setSettingFilter] = useState<SettingFilter>('drift');
  const [settingQuery, setSettingQuery] = useState('');
  const counts = settingCounts(match);
  const changed = counts.different + counts.missingInTenant;
  const identical = counts.matching;
  const totalBaselineSettings = counts.matching + counts.different + counts.missingInTenant;
  const noComparableSettings =
    match.settingComparisons.length === 0 &&
    (match.policyA?.warnings.some((warning) => warning.includes('No comparable settings')) ||
      match.policyB?.warnings.some((warning) => warning.includes('No comparable settings')));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{match.policyA?.displayName ?? match.policyB?.displayName ?? match.normalizedName}</CardTitle>
            <CardDescription>
              {match.policyA?.policyType ?? match.policyB?.policyType} · {businessPolicyStatus(match)} · confidence {Math.round(match.confidence * 100)}%
            </CardDescription>
          </div>
          <Badge variant={statusVariant(match.status)}>{businessPolicyStatus(match)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {match.policyA && match.status !== 'matched' ? (
          <div className="rounded-md border bg-sky-50/70 p-3">
            <label className="space-y-1 text-sm font-semibold">
              Choose matching tenant policy
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                defaultValue={match.policyB?.id ?? ''}
                onChange={(event) => {
                  if (event.target.value) onManualMatch(match.policyA!.id, event.target.value);
                }}
              >
                <option value="">Select a tenant policy...</option>
                {tenantPolicies.map((policy) => (
                  <option value={policy.id} key={policy.id}>
                    {policy.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
        {match.policyA && match.status === 'possible' ? (
          <div className="flex flex-wrap gap-2 rounded-md border bg-amber-950/20 p-3">
            <Button
              onClick={() => {
                const candidateId = match.candidateMatches[0]?.tenantPolicyId;
                if (match.policyA && candidateId) onManualMatch(match.policyA.id, candidateId);
              }}
            >
              Accept top candidate
            </Button>
            <Button variant="outline" onClick={() => match.policyA && onRejectMatch(match.policyA.id)}>
              Reject suggestion
            </Button>
          </div>
        ) : null}
        {match.status === 'possible' && match.candidateMatches.length > 0 ? (
          <div className="rounded-md border p-3">
            <div className="mb-2 text-sm font-semibold">Suggested candidates</div>
            <div className="space-y-2">
              {match.candidateMatches.map((candidate) => (
                <div className="rounded-md border bg-card p-3" key={candidate.tenantPolicyId}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{candidate.tenantPolicyName}</div>
                      <div className="text-xs text-muted-foreground">{candidate.tenantNormalizedName}</div>
                    </div>
                    <Badge variant={candidate.confidence >= 0.8 ? 'success' : 'warning'}>
                      {Math.round(candidate.confidence * 100)}%
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-xs">
                    <Badge variant="secondary">{candidate.diffSummary.identical} matching</Badge>
                    <Badge variant={candidate.diffSummary.different > 0 ? 'warning' : 'secondary'}>
                      {candidate.diffSummary.different} different
                    </Badge>
                    <Badge variant={candidate.diffSummary.missingInTenant > 0 ? 'destructive' : 'secondary'}>
                      {candidate.diffSummary.missingInTenant} missing in tenant
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{leftLabel}</div>
            <div>{match.policyA?.displayName ?? 'Missing'}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{rightLabel}</div>
            <div>{match.policyB?.displayName ?? 'Missing'}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Badge variant="secondary">{totalBaselineSettings} baseline settings</Badge>
          <Badge variant="success">{identical} matching</Badge>
          <Badge variant={counts.different > 0 ? 'warning' : 'secondary'}>{counts.different} different</Badge>
          <Badge variant={counts.missingInTenant > 0 ? 'destructive' : 'secondary'}>{counts.missingInTenant} missing in tenant</Badge>
          <Badge variant={counts.extraInTenant > 0 ? 'warning' : 'secondary'}>{counts.extraInTenant} extra tenant settings</Badge>
          {match.reasons.map((reason) => (
            <Badge variant="secondary" key={reason}>
              {reason}
            </Badge>
          ))}
          {noComparableSettings ? <Badge variant="warning">Unsupported or metadata-only settings</Badge> : null}
        </div>
        {noComparableSettings ? (
          <div className="rounded-md border p-3 text-sm text-muted-foreground">
            This policy did not produce comparable settings. The source likely contains only metadata or an unsupported Intune schema.
          </div>
        ) : null}
        <details>
          <summary className="cursor-pointer font-semibold text-primary">
            {changed > 0 || counts.extraInTenant > 0 ? 'Review setting differences' : 'Open setting comparison'}
          </summary>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3">
              <Input
                className="max-w-sm bg-background/55"
                placeholder="Search settings in this policy"
                value={settingQuery}
                onChange={(event) => setSettingQuery(event.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {([
                  ['drift', 'Drift'],
                  ['different', 'Different'],
                  ['missingInTenant', 'Missing'],
                  ['extraInTenant', 'Extra'],
                  ['matching', 'Matching'],
                  ['all', 'All'],
                ] as [SettingFilter, string][]).map(([value, label]) => (
                  <Button className="h-8 px-3" key={value} variant={settingFilter === value ? 'default' : 'outline'} onClick={() => setSettingFilter(value)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <SettingRows
              settings={match.settingComparisons}
              leftLabel={leftLabel}
              rightLabel={rightLabel}
              settingFilter={settingFilter}
              settingQuery={settingQuery}
              onNotice={onNotice}
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
