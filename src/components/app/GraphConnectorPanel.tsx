import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

export interface GraphConfigState {
  clientId: string;
  tenantId: string;
  tenantName: string;
  prefix: string;
  useSharedClient: boolean;
  includeAssignments: boolean;
}

export function GraphConnectorPanel({
  config,
  sharedAppName,
  sharedClientAvailable,
  graphSignedInLabel,
  isGraphBusy,
  onConfigChange,
  onSignIn,
  onFetch,
  onSignOut,
}: {
  config: GraphConfigState;
  sharedAppName: string;
  sharedClientAvailable: boolean;
  graphSignedInLabel: string;
  isGraphBusy: boolean;
  onConfigChange: (next: GraphConfigState) => void;
  onSignIn: () => void;
  onFetch: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Microsoft Graph connector</CardTitle>
          <CardDescription>
            Sign in with delegated Microsoft Entra auth and fetch Intune policies directly into the same comparison engine. Baseline upload remains local JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="font-semibold">App registration mode</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {sharedClientAvailable
                ? `Use one shared multitenant registration by default. Switch to custom only if you need to test another app registration.`
                : 'No shared app registration is configured yet. Enter a custom client ID below or configure a shared one once in app settings.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant={config.useSharedClient ? 'default' : 'outline'}
                disabled={!sharedClientAvailable}
                onClick={() => onConfigChange({ ...config, useSharedClient: true })}
              >
                Shared registration
              </Button>
              <Button
                variant={!config.useSharedClient ? 'default' : 'outline'}
                onClick={() => onConfigChange({ ...config, useSharedClient: false })}
              >
                Custom override
              </Button>
            </div>
            {config.useSharedClient && sharedClientAvailable ? (
              <div className="mt-3 rounded-md border p-3 text-sm text-muted-foreground">
                Using <strong>{sharedAppName}</strong>.
              </div>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {!config.useSharedClient ? (
              <label className="space-y-1 text-sm font-medium">
                Application client ID
                <Input
                  placeholder="00000000-0000-0000-0000-000000000000"
                  value={config.clientId}
                  onChange={(event) => onConfigChange({ ...config, clientId: event.target.value })}
                />
              </label>
            ) : null}
            <label className="space-y-1 text-sm font-medium">
              Tenant ID or domain
              <Input
                placeholder="contoso.onmicrosoft.com or organizations"
                value={config.tenantId}
                onChange={(event) => onConfigChange({ ...config, tenantId: event.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tenant label
              <Input value={config.tenantName} onChange={(event) => onConfigChange({ ...config, tenantName: event.target.value })} />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tenant prefix to remove
              <Input
                placeholder="ACME, ACME -, ACME_"
                value={config.prefix}
                onChange={(event) => onConfigChange({ ...config, prefix: event.target.value })}
              />
            </label>
          </div>

          <label className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm">
            <input
              checked={config.includeAssignments}
              className="mt-1"
              type="checkbox"
              onChange={(event) => onConfigChange({ ...config, includeAssignments: event.target.checked })}
            />
            <span>
              <span className="block font-semibold">Fetch assignment payloads when available</span>
              <span className="text-muted-foreground">Includes assignment objects exposed by the policy endpoints. Group display-name lookup still requires extra permissions.</span>
            </span>
          </label>
          <div className="rounded-lg border bg-card p-4">
            <div className="font-semibold">Connection status</div>
            <div className="mt-1 text-sm text-muted-foreground">{graphSignedInLabel}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onSignIn}>Connect to Microsoft Graph</Button>
              <Button disabled={graphSignedInLabel.startsWith('Not signed in') || isGraphBusy} variant="outline" onClick={onFetch}>
                {isGraphBusy ? 'Fetching Intune policies...' : 'Fetch tenant policies'}
              </Button>
              <Button disabled={graphSignedInLabel.startsWith('Not signed in')} variant="ghost" onClick={onSignOut}>
                Sign out
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            Upload your baseline JSON on the JSON import page. If a baseline file is selected but not parsed yet, the Graph fetch action will parse it before comparing.
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader>
          <CardTitle>Shared registration setup</CardTitle>
          <CardDescription>Configure one multitenant SPA registration once, then reuse it across tenants. Do not use client secrets here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            readOnly
            value={[
              'Recommended model:',
              'One shared multitenant SPA registration for IntuneBabo',
              '',
              'Redirect URI:',
              typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '',
              '',
              'Platform type:',
              'Single-page application (SPA)',
              '',
              'Delegated API permission:',
              'DeviceManagementConfiguration.Read.All',
              '',
              'Fetched endpoints:',
              'GET /beta/deviceManagement/configurationPolicies?$expand=settings[,assignments]',
              'GET /v1.0/deviceManagement/deviceConfigurations',
              'GET /v1.0/deviceManagement/deviceCompliancePolicies',
              'GET /v1.0/deviceAppManagement/managedAppPolicies',
            ].join('\n')}
          />
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="rounded-md border p-3">Set the shared client ID once through environment configuration, then reuse it instead of creating a new app registration per customer tenant.</div>
            <div className="rounded-md border p-3">Settings Catalog and security baselines use Graph beta because expanded settings are not consistently available in v1.0.</div>
            <div className="rounded-md border p-3">Fetched Intune data is processed in browser memory and then compared locally.</div>
            <div className="rounded-md border p-3">Optional assignment payloads preserve raw assignment evidence; resolving group display names still requires group lookup permissions.</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
