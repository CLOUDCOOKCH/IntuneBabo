import { afterEach, describe, expect, it, vi } from 'vitest';
import { compareTenants } from '../lib/comparison/policyMatcher';
import { compareSettings } from '../lib/comparison/settingsCompare';
import { generateTenantHtmlReport } from '../lib/export/reportExport';
import { completeGraphSignInFromRedirect, getStoredGraphToken } from '../lib/graph/graphAuth';
import { GraphPolicyProvider } from '../lib/graph/policyProvider';
import { normalizePolicyNameV2 } from '../lib/normalization/policyName';
import { describeSetting, formatSettingValue } from '../lib/normalization/settingDictionary';
import { humanizeSettingName } from '../lib/normalization/settingName';
import { parseTenantFiles } from '../lib/parsers/intuneJsonParser';
import type { JsonValue } from '../types/intune';
import type { NormalizedPolicy, TenantImport } from '../types/tenantdiff';

function jsonValue(value: unknown): JsonValue {
  return value as JsonValue;
}

function policy(displayName: string, tenant: 'A' | 'B', settings: Record<string, unknown> = {}): NormalizedPolicy {
  return {
    id: `${tenant}-${displayName}`,
    displayName,
    normalizedName: normalizePolicyNameV2(displayName, tenant === 'A' ? ['ACME'] : ['CONTOSO']),
    sourceTenant: tenant,
    sourceKind: 'json',
    sourceRef: 'test.json',
    policyType: 'settingsCatalog',
    assignments: [],
    settings: Object.entries(settings).map(([key, value]) => ({
      id: key,
      displayName: key,
      normalizedPath: key.toLocaleLowerCase(),
      value: jsonValue(value),
      valueType: typeof value,
      source: 'test',
      raw: jsonValue(value),
    })),
    rawJson: { displayName },
    sourceFile: 'test.json',
    warnings: [],
  };
}

function tenant(name: string, key: 'A' | 'B', policies: NormalizedPolicy[]): TenantImport {
  return { tenant: key, tenantName: name, prefix: '', policies, issues: [], diagnostics: [], fileNames: [] };
}

interface MockStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function createMockWindow(search = ''): Window & typeof globalThis {
  const store = new Map<string, string>();
  const sessionStorage: MockStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
  };

  return {
    sessionStorage,
    location: {
      search,
      pathname: '/app',
      hash: '',
      origin: 'http://localhost:5174',
      assign: vi.fn(),
    },
    history: {
      replaceState: vi.fn(),
    },
  } as unknown as Window & typeof globalThis;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
});

describe('IntuneCooker clean-room engine', () => {
  it('normalizes customer prefixes and separators', () => {
    expect(normalizePolicyNameV2('ACME - WIN - Security Baseline - Defender', ['ACME'])).toBe(
      'win security baseline defender',
    );
  });

  it('matches policies by normalized name and compares settings', () => {
    const result = compareTenants(
      tenant('A', 'A', [policy('ACME - WIN - Security Baseline - Defender', 'A', { firewall: true })]),
      tenant('B', 'B', [policy('CONTOSO - WIN - Security Baseline - Defender', 'B', { firewall: false })]),
      true,
    );

    expect(result.summary.matchedPolicies).toBe(1);
    expect(result.summary.differentSettings).toBe(1);
  });

  it('classifies missing settings', () => {
    const comparisons = compareSettings(policy('ACME - Policy', 'A', { one: true }), policy('CONTOSO - Policy', 'B', {}));
    expect(comparisons[0]?.status).toBe('missingInB');
  });

  it('treats Intune enum suffixes and numeric values as the same setting value', () => {
    const comparisons = compareSettings(
      policy('ACME - Policy', 'A', {
        localnetworkaccessallowedforurls:
          'device_vendor_msft_policy_config_chromeintunev141~policy~googlechrome~localnetworkaccesssettings.localnetworkaccessallowedforurls_1',
      }),
      policy('CONTOSO - Policy', 'B', { localnetworkaccessallowedforurls: 1 }),
    );

    expect(comparisons[0]?.status).toBe('identical');
  });

  it('generates a standalone report', () => {
    const result = compareTenants(
      tenant('A', 'A', [policy('ACME - Policy', 'A', { setting: 'left' })]),
      tenant('B', 'B', [policy('CONTOSO - Policy', 'B', { setting: 'right' })]),
      true,
    );
    const html = generateTenantHtmlReport(result);
    expect(html).toContain('IntuneCooker Report');
    expect(html).toContain('Interactive HTML report');
    expect(html).toContain('Search policies, setting names, paths, or values');
    expect(html).toContain('data-filter="drift"');
    expect(html).toContain('data-report-script="interactive-v2"');
    expect(html).toContain('data-expand="all"');
    expect(html).toContain('dataset.reportInteractive');
    expect(html).toContain('Review setting evidence');
    expect(html).toContain('Copy failed');
  });

  it('wraps Graph settings collections as one policy named from the file', async () => {
    const file = new File(
      [
        JSON.stringify({
          '@odata.context':
            'https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies(policy-id)/settings',
          value: [
            {
              id: '0',
              settingInstance: {
                settingDefinitionId: 'device_vendor_msft_policy_config_example',
                choiceSettingValue: { value: 'enabled' },
              },
            },
            {
              id: '1',
              settingInstance: {
                settingDefinitionId: 'device_vendor_msft_policy_config_other',
                choiceSettingValue: { value: 'disabled' },
              },
            },
          ],
        }),
      ],
      'BASE-Administrative Template.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'B', 'Tenant', '');

    expect(result.policies).toHaveLength(1);
    expect(result.policies[0]?.displayName).toBe('BASE-Administrative Template');
    expect(result.policies[0]?.settings).toHaveLength(2);
    expect(result.diagnostics[0]?.confidence).toBe('medium');
    expect(result.diagnostics[0]?.samplePolicies[0]?.sampleSettings[0]?.displayName).toBe('Example');
    expect(result.issues).toEqual([]);
  });

  it('turns Intune setting definition IDs into readable labels', () => {
    expect(humanizeSettingName('device_vendor_msft_policy_config_devicelock_preventenablinglockscreencamera')).toBe(
      'Device Lock Prevent Enabling Lock Screen Camera',
    );
    expect(humanizeSettingName('device_vendor_msft_policy_config_defender_allowarchivescanning')).toBe(
      'Defender Allow Archive Scanning',
    );
  });

  it('uses dictionary labels and readable value labels for known settings', () => {
    expect(describeSetting('localnetworkaccessallowedforurls').label).toBe('Local network access allowed for URLs');
    expect(formatSettingValue('localnetworkaccessallowedforurls', 1)).toBe('Enabled (1)');
  });

  it('uses nested Intune setting IDs and values instead of Graph row IDs', async () => {
    const file = new File(
      [
        JSON.stringify({
          value: [
            {
              id: '0',
              settingInstance: {
                settingDefinitionId: 'device_vendor_msft_policy_config_microsoft_edgev92_example',
                choiceSettingValue: {
                  value: 'device_vendor_msft_policy_config_microsoft_edgev92_example_1',
                },
              },
            },
          ],
        }),
      ],
      'Edge baseline settings.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'Baseline', 'Baseline', '');
    const setting = result.policies[0]?.settings[0];

    expect(setting?.id).toBe('device_vendor_msft_policy_config_microsoft_edgev92_example');
    expect(setting?.displayName).toBe('Microsoft Edge: Example');
    expect(setting?.value).toBe('device_vendor_msft_policy_config_microsoft_edgev92_example_1');
  });

  it('extracts child setting instances from Settings Catalog choices', async () => {
    const file = new File(
      [
        JSON.stringify({
          name: 'Nested policy',
          settings: [
            {
              id: '0',
              settingInstance: {
                settingDefinitionId: 'device_vendor_msft_policy_config_parent',
                choiceSettingValue: {
                  value: 'enabled',
                  children: [
                    {
                      settingDefinitionId: 'device_vendor_msft_policy_config_child',
                      simpleSettingValue: { value: 15 },
                    },
                  ],
                },
              },
            },
          ],
        }),
      ],
      'nested.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'Baseline', 'Baseline', '');
    const paths = result.policies[0]?.settings.map((setting) => setting.id);

    expect(paths).toEqual(['device_vendor_msft_policy_config_parent', 'device_vendor_msft_policy_config_child']);
    expect(result.policies[0]?.settings[1]?.value).toBe(15);
  });

  it('does not treat a Graph policy list with expanded settings as a settings collection', async () => {
    const file = new File(
      [
        JSON.stringify({
          '@odata.context':
            'https://graph.microsoft.com/beta/$metadata#deviceManagement/configurationPolicies(assignments(),settings())',
          value: [
            {
              id: 'policy-1',
              name: 'Baseline Policy One',
              settings: [
                {
                  settingInstance: {
                    settingDefinitionId: 'device_vendor_msft_policy_config_one',
                    choiceSettingValue: { value: 'enabled' },
                  },
                },
              ],
            },
            {
              id: 'policy-2',
              name: 'Baseline Policy Two',
              settings: [
                {
                  settingInstance: {
                    settingDefinitionId: 'device_vendor_msft_policy_config_two',
                    choiceSettingValue: { value: 'enabled' },
                  },
                },
              ],
            },
          ],
        }),
      ],
      'expanded-policies.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'Baseline', 'Baseline', '');

    expect(result.policies.map((item) => item.displayName)).toEqual(['Baseline Policy One', 'Baseline Policy Two']);
  });

  it('simplifies ADMX policy setting paths and unwraps Graph value objects', async () => {
    const file = new File(
      [
        JSON.stringify({
          name: 'Chrome Settings',
          settings: [
            {
              settingInstance: {
                settingDefinitionId:
                  'device_vendor_msft_policy_config_chromeintunev141~policy~googlechrome~localnetworkaccesssettings.localnetworkaccessallowedforurls',
                simpleSettingValue: {
                  '@odata.type': '#microsoft.graph.deviceManagementConfigurationStringSettingValue',
                  value: 'https://example.test',
                },
              },
            },
          ],
        }),
      ],
      'chrome.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'Baseline', 'Baseline', '');
    const setting = result.policies[0]?.settings[0];

    expect(setting?.id).toBe('localnetworkaccessallowedforurls');
    expect(setting?.displayName).toBe('Local network access allowed for URLs');
    expect(setting?.value).toBe('https://example.test');
  });

  it('loads Graph endpoint data through the provider and normalizes it', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      return new Response(
        JSON.stringify({
          value: url.includes('configurationPolicies')
            ? [
                {
                  id: 'policy-1',
                  name: 'ACME - Chrome Settings',
                  settings: [
                    {
                      settingInstance: {
                        settingDefinitionId:
                          'device_vendor_msft_policy_config_chromeintunev141~policy~googlechrome~localnetworkaccesssettings.localnetworkaccessallowedforurls',
                        simpleSettingValue: { value: 1 },
                      },
                    },
                  ],
                },
              ]
            : [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as typeof fetch;

    try {
      const result = await new GraphPolicyProvider({ accessToken: 'token', expiresAt: Date.now() + 60_000 }).loadPolicies({
        tenant: 'B',
        tenantName: 'Graph Tenant',
        prefix: 'ACME',
      });

      expect(calls.some((url) => url.includes('/beta/deviceManagement/configurationPolicies'))).toBe(true);
      expect(result.policies.some((item) => item.displayName === 'ACME - Chrome Settings')).toBe(true);
      expect(result.policies[0]?.settings[0]?.displayName).toBe('Local network access allowed for URLs');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps partial Graph results and reports endpoint-level failures', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('configurationPolicies')) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 'policy-1',
                name: 'ACME - Edge Baseline',
                settings: [
                  {
                    settingInstance: {
                      settingDefinitionId: 'device_vendor_msft_policy_config_microsoft_edgev92_example',
                      simpleSettingValue: { value: 1 },
                    },
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('deviceConfigurations')) {
        return new Response('<html>failure</html>', { status: 500, headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(JSON.stringify({ value: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;

    try {
      const result = await new GraphPolicyProvider({ accessToken: 'token', expiresAt: Date.now() + 60_000 }).loadPolicies({
        tenant: 'B',
        tenantName: 'Graph Tenant',
        prefix: 'ACME',
      });

      expect(result.policies).toHaveLength(1);
      expect(result.issues.some((issue) => issue.endpoint?.includes('deviceConfigurations'))).toBe(true);
      expect(result.issues.some((issue) => issue.source === 'graph')).toBe(true);
      expect(result.diagnostics.some((diagnostic) => diagnostic.endpoint?.includes('configurationPolicies'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('drops corrupted Graph auth storage payloads', () => {
    const mockWindow = createMockWindow();
    mockWindow.sessionStorage.setItem('intunecooker.graph.auth', '{bad-json');
    globalThis.window = mockWindow;

    expect(getStoredGraphToken()).toBeNull();
    expect(mockWindow.sessionStorage.getItem('intunecooker.graph.auth')).toBeNull();
  });

  it('rejects Graph redirect callbacks when state does not match', async () => {
    const mockWindow = createMockWindow('?code=abc&state=wrong-state');
    mockWindow.sessionStorage.setItem(
      'intunecooker.graph.pendingAuth',
      JSON.stringify({
        verifier: 'verifier',
        state: 'expected-state',
        config: {
          clientId: 'client-id',
          tenantId: 'organizations',
          redirectUri: 'http://localhost:5174/app',
          scopes: ['openid'],
        },
      }),
    );
    globalThis.window = mockWindow;
    globalThis.document = { title: 'IntuneCooker' } as Document;

    await expect(completeGraphSignInFromRedirect()).rejects.toThrow('Microsoft Graph sign-in state did not match.');
    expect(mockWindow.sessionStorage.getItem('intunecooker.graph.pendingAuth')).toBeNull();
  });

  it('marks metadata-only policy payloads as unsupported instead of inventing pseudo-settings', async () => {
    const file = new File(
      [
        JSON.stringify({
          id: 'policy-1',
          displayName: 'Metadata Only Policy',
          description: 'No settings here',
          createdDateTime: '2026-05-12T09:00:00Z',
          lastModifiedDateTime: '2026-05-12T09:01:00Z',
          version: 3,
          assignments: [],
        }),
      ],
      'metadata-only.json',
      { type: 'application/json' },
    );

    const result = await parseTenantFiles([file], 'Baseline', 'Baseline', '');

    expect(result.policies[0]?.settings).toEqual([]);
    expect(result.policies[0]?.warnings).toContain('No comparable settings found. Raw JSON is still retained.');
    expect(result.diagnostics[0]?.warnings).toContain('No comparable settings found. Raw JSON is still retained.');
  });

  it('includes original names and files when normalized policy names collide', async () => {
    const fileA = new File([JSON.stringify({ displayName: 'ACME - Chrome Baseline' })], 'chrome-a.json', { type: 'application/json' });
    const fileB = new File([JSON.stringify({ displayName: 'ACME_Chrome Baseline' })], 'chrome-b.json', { type: 'application/json' });

    const result = await parseTenantFiles([fileA, fileB], 'Baseline', 'Baseline', 'ACME');
    const duplicateIssue = result.issues.find((issue) => issue.message.includes('Duplicate normalized policy name'));

    expect(duplicateIssue?.details).toEqual(
      expect.arrayContaining(['ACME - Chrome Baseline (chrome-a.json)', 'ACME_Chrome Baseline (chrome-b.json)']),
    );
  });
});
