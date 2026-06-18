import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, BarChart3, CheckCircle2, Download, FileJson, GitCompareArrows, Lock, Search, ShieldCheck } from 'lucide-react';
import intuneCookerLogo from './assets/intunecooker-logo.svg';
import { IntuneCookerLogo } from './components/app/IntuneCookerLogo';
import { NotificationBanner } from './components/app/NotificationBanner';
import { SummaryCard } from './components/app/SummaryCard';
import type { GraphConfigState } from './components/app/GraphConnectorPanel';
import { UploadCard, type UploadState } from './components/app/UploadCard';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Tabs, type TabItem } from './components/ui/tabs';
import { createWorkerClient, type WorkerClient } from './lib/comparison/workerClient';
import { comparisonToCsv, generateTenantHtmlReport } from './lib/export/reportExport';
import {
  beginGraphSignIn,
  clearGraphToken,
  completeGraphSignInFromRedirect,
  getStoredGraphToken,
  graphDefaultScopes,
  type GraphToken,
} from './lib/graph/graphAuth';
import { sharedGraphRegistration } from './lib/graph/sharedConfig';
import { emptyImport, fetchGraphSourceDocuments } from './lib/graph/policyProvider';
import { searchPolicies } from './lib/comparison/search';
import { assessmentLabel, assessmentStatus, canRunComparison, matchSettingCounts, statusVariant, type CompareFilter } from './lib/app/assessment';
import type {
  AppNotice,
  BaselineComparisonResult,
  ImportSourceDocument,
  MatchDecisionMap,
  TenantComparisonResult,
  TenantImport,
} from './types/tenantdiff';
import { decodeTextFile } from './utils/decodeTextFile';
import { downloadTextFile } from './utils/download';


const GraphConnectorPanel = lazy(() => import('./components/app/GraphConnectorPanel').then((module) => ({ default: module.GraphConnectorPanel })));
const ImportReviewPanel = lazy(() => import('./components/app/ImportReviewPanel').then((module) => ({ default: module.ImportReviewPanel })));
const MatchReviewPanel = lazy(() => import('./components/app/MatchReviewPanel').then((module) => ({ default: module.MatchReviewPanel })));
const PolicyDetailsCard = lazy(() => import('./components/app/PolicyDetailsCard').then((module) => ({ default: module.PolicyDetailsCard })));

function LoadingPanel() {
  return <div className="rounded-lg border p-4 text-sm text-muted-foreground">Loading workspace...</div>;
}

type Page = 'home' | 'import' | 'review' | 'matches' | 'compare' | 'search' | 'privacy' | 'graph';

const navItems: TabItem<Page>[] = [
  { value: 'home', label: 'Home' },
  { value: 'import', label: 'JSON import' },
  { value: 'review', label: 'Import review' },
  { value: 'matches', label: 'Review matches' },
  { value: 'compare', label: 'Assessment' },
  { value: 'search', label: 'Search' },
  { value: 'privacy', label: 'Privacy' },
  { value: 'graph', label: 'Graph' },
];

const initialTenant: UploadState = { tenantName: 'Tenant', prefix: 'ACME', files: [] };
const initialBaseline: UploadState = { tenantName: 'Baseline', prefix: '', files: [] };
const initialGraphConfig: GraphConfigState = {
  clientId: '',
  tenantId: sharedGraphRegistration?.tenantId ?? 'organizations',
  tenantName: 'Graph tenant',
  prefix: '',
  useSharedClient: sharedGraphRegistration !== null,
  includeAssignments: false,
};

const homeSignals = [
  { label: 'Local JSON mode', value: 'Zero backend' },
  { label: 'Assessment workflow', value: 'Import -> review -> assess' },
  { label: 'Report output', value: 'HTML, JSON, CSV' },
  { label: 'Graph readiness', value: 'Shared multitenant sign-in' },
];

const homeCapabilities = [
  {
    title: 'Trust the parse before the diff',
    description: 'Import review exposes schema detection, unsupported objects, metadata-only payloads, duplicate names, and sample settings before you compare anything.',
  },
  {
    title: 'Resolve uncertain matches explicitly',
    description: 'Low-confidence policy matching is a review queue, not a hidden assumption. Keep exact matches automatic and approve fuzzy mappings deliberately.',
  },
  {
    title: 'Read settings like an admin',
    description: 'Curated setting translation turns raw Intune and CSP paths into readable labels and clearer value meanings while preserving raw evidence when needed.',
  },
  {
    title: 'Export a deliverable, not a dump',
    description: 'The offline report separates confirmed drift, unresolved matches, unsupported policies, and missing baseline coverage into a format you can hand over.',
  },
];

const homeWorkflow = [
  {
    step: '01',
    title: 'Ingest tenant and baseline exports',
    description: 'Upload one tenant and one baseline library, or fetch the tenant directly from Graph while keeping the baseline local.',
  },
  {
    step: '02',
    title: 'Review import quality',
    description: 'Exclude policies you do not want in scope, inspect parser confidence, and catch odd exports before they contaminate the assessment.',
  },
  {
    step: '03',
    title: 'Validate candidate matches',
    description: 'Accept or reject fuzzy policy matches with quick drift previews so the comparison model reflects your intent.',
  },
  {
    step: '04',
    title: 'Ship the assessment',
    description: 'Search globally, inspect setting evidence side by side, then export HTML, JSON, and CSV results for downstream review.',
  },
];

const homeDeliverables = [
  'Baseline coverage percentage',
  'Confirmed drift and missing policy counts',
  'Unresolved candidate match inventory',
  'Translated setting evidence with raw fallback',
];

function exportName(kind: string, extension: string): string {
  return `intunecooker-${kind}-${new Date().toISOString().replaceAll(':', '-')}.${extension}`;
}

function readJsonFileInput<T>(file: File): Promise<T> {
  return file.arrayBuffer().then((buffer) => JSON.parse(decodeTextFile(buffer)) as T);
}

async function filesToDocuments(files: File[]): Promise<ImportSourceDocument[]> {
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      text: decodeTextFile(await file.arrayBuffer()),
      size: file.size,
      sourceKind: 'json' as const,
      sourceRef: file.name,
    })),
  );
}

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [tenantUpload, setTenantUpload] = useState<UploadState>(initialTenant);
  const [baselineUpload, setBaselineUpload] = useState<UploadState>(initialBaseline);
  const [tenant, setTenant] = useState<TenantImport>(() => emptyImport('B', 'Tenant'));
  const [baseline, setBaseline] = useState<TenantImport>(() => emptyImport('Baseline', 'Baseline'));
  const [excludedPolicyIds, setExcludedPolicyIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<TenantComparisonResult | null>(null);
  const [baselineResult, setBaselineResult] = useState<BaselineComparisonResult | null>(null);
  const [fuzzyEnabled, setFuzzyEnabled] = useState(true);
  const [matchDecisions, setMatchDecisions] = useState<MatchDecisionMap>({});
  const [compareFilter, setCompareFilter] = useState<CompareFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [isBusy, setIsBusy] = useState(false);
  const [graphConfig, setGraphConfig] = useState<GraphConfigState>(initialGraphConfig);
  const [graphToken, setGraphToken] = useState<GraphToken | null>(() => getStoredGraphToken());
  const workerRef = useRef<WorkerClient | null>(null);

  function showNotice(tone: AppNotice['tone'], message: string): void {
    setNotice({ id: `${Date.now()}`, tone, message });
  }

  useEffect(() => {
    workerRef.current = createWorkerClient();
    return () => workerRef.current?.dispose();
  }, []);

  useEffect(() => {
    completeGraphSignInFromRedirect()
      .then((token) => {
        if (token) setGraphToken(token);
      })
      .catch((error) => showNotice('error', error instanceof Error ? error.message : 'Microsoft Graph sign-in failed.'));
  }, []);

  useEffect(() => {
    document.title = 'IntuneCooker';
    const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const link = existing ?? document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = intuneCookerLogo;
    if (!existing) document.head.append(link);
  }, []);

  useEffect(() => {
    setSelectedPolicyId(null);
    setCompareFilter('all');
    setComparison(null);
    setBaselineResult(null);
    setMatchDecisions({});
    setExcludedPolicyIds([]);
  }, [tenantUpload.files, baselineUpload.files]);

  const allPolicies = useMemo(() => [...tenant.policies, ...baseline.policies], [tenant, baseline]);
  const searchResults = useMemo(() => searchPolicies(allPolicies, query), [allPolicies, query]);
  const effectiveTenant = useMemo(
    () => ({
      ...tenant,
      policies: tenant.policies.filter((policy) => !excludedPolicyIds.includes(policy.id)),
    }),
    [tenant, excludedPolicyIds],
  );
  const effectiveBaseline = useMemo(
    () => ({
      ...baseline,
      policies: baseline.policies.filter((policy) => !excludedPolicyIds.includes(policy.id)),
    }),
    [baseline, excludedPolicyIds],
  );

  const comparisonMatches = comparison?.matches ?? [];
  const filteredMatches = useMemo(
    () => comparisonMatches.filter((match) => compareFilter === 'all' || assessmentStatus(match) === compareFilter),
    [compareFilter, comparisonMatches],
  );
  const outcomeCounts = useMemo(
    () => ({
      all: comparisonMatches.length,
      unsupported: comparisonMatches.filter((match) => assessmentStatus(match) === 'unsupported').length,
      missingPolicy: comparisonMatches.filter((match) => assessmentStatus(match) === 'missingPolicy').length,
      review: comparisonMatches.filter((match) => assessmentStatus(match) === 'review').length,
      drift: comparisonMatches.filter((match) => assessmentStatus(match) === 'drift').length,
      compliant: comparisonMatches.filter((match) => assessmentStatus(match) === 'compliant').length,
      extra: comparisonMatches.filter((match) => assessmentStatus(match) === 'extra').length,
    }),
    [comparisonMatches],
  );

  const selectedMatch = filteredMatches.find((match) => match.id === selectedPolicyId) ?? filteredMatches[0];

  function toggleExcludedPolicy(policyId: string): void {
    setExcludedPolicyIds((current) => (current.includes(policyId) ? current.filter((id) => id !== policyId) : [...current, policyId]));
    setComparison(null);
    setBaselineResult(null);
    setSelectedPolicyId(null);
  }

  async function parseCurrentSources(tenantDocuments?: ImportSourceDocument[], baselineDocuments?: ImportSourceDocument[]): Promise<void> {
    const worker = workerRef.current;
    if (!worker) throw new Error('Comparison worker is not ready.');

    setIsBusy(true);
    setProgressMessage('');
    setNotice(null);
    try {
      const nextTenantDocuments = tenantDocuments ?? (await filesToDocuments(tenantUpload.files));
      const nextBaselineDocuments = baselineDocuments ?? (await filesToDocuments(baselineUpload.files));
      const parsed = await worker.parseImports(
        {
          tenant: {
            tenant: 'B',
            tenantName: tenantUpload.tenantName.trim() || 'Tenant',
            prefix: tenantUpload.prefix,
            documents: nextTenantDocuments,
          },
          baseline: {
            tenant: 'Baseline',
            tenantName: baselineUpload.tenantName.trim() || 'Baseline',
            prefix: baselineUpload.prefix,
            documents: nextBaselineDocuments,
          },
        },
        (_stage, message) => setProgressMessage(message),
      );

      setTenant(parsed.tenant);
      setBaseline(parsed.baseline);
      setPage('review');
      showNotice('success', 'Imports parsed. Review source quality before running the assessment.');
    } finally {
      setIsBusy(false);
      setProgressMessage('');
    }
  }

  async function generateAssessment(nextDecisions = matchDecisions): Promise<void> {
    const worker = workerRef.current;
    if (!worker) throw new Error('Comparison worker is not ready.');
    if (!canRunComparison(effectiveTenant, effectiveBaseline)) {
      showNotice('error', 'Comparison is blocked until both baseline and tenant imports parse without hard errors.');
      return;
    }

    setIsBusy(true);
    setProgressMessage('');
    setNotice(null);
    try {
      const generated = await worker.generateComparison(
        { tenant: effectiveTenant, baseline: effectiveBaseline, fuzzyEnabled },
        (_stage, message) => setProgressMessage(message),
      );

      const applied =
        Object.keys(nextDecisions).length > 0
          ? await worker.applyMatchDecisions(
              { tenant: effectiveTenant, baseline: effectiveBaseline, fuzzyEnabled, comparison: generated.comparison, decisions: nextDecisions },
              (_stage, message) => setProgressMessage(message),
            )
          : generated;

      setComparison(applied.comparison);
      setBaselineResult(applied.baselineResult);
      setSelectedPolicyId(applied.comparison.matches[0]?.id ?? null);
      setPage(applied.comparison.summary.possibleMatches > 0 ? 'matches' : 'compare');
      showNotice('success', 'Assessment generated successfully.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Comparison failed.');
    } finally {
      setIsBusy(false);
      setProgressMessage('');
    }
  }

  async function applyDecisions(nextDecisions: MatchDecisionMap): Promise<void> {
    const worker = workerRef.current;
    if (!worker || !comparison) return;

    setIsBusy(true);
    setProgressMessage('');
    try {
      const applied = await worker.applyMatchDecisions(
        { tenant: effectiveTenant, baseline: effectiveBaseline, fuzzyEnabled, comparison, decisions: nextDecisions },
        (_stage, message) => setProgressMessage(message),
      );
      setMatchDecisions(nextDecisions);
      setComparison(applied.comparison);
      setBaselineResult(applied.baselineResult);
      setSelectedPolicyId(applied.comparison.matches[0]?.id ?? null);
      showNotice('success', 'Match decisions applied.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Could not apply match decisions.');
    } finally {
      setIsBusy(false);
      setProgressMessage('');
    }
  }

  function acceptSuggestedMatch(baselinePolicyId: string, tenantPolicyId: string): void {
    const baselinePolicy = effectiveBaseline.policies.find((policy) => policy.id === baselinePolicyId);
    const tenantPolicy = effectiveTenant.policies.find((policy) => policy.id === tenantPolicyId);
    if (!baselinePolicy || !tenantPolicy) return;
    void applyDecisions({
      ...matchDecisions,
      [baselinePolicy.normalizedName]: {
        action: 'accept',
        baselinePolicyName: baselinePolicy.normalizedName,
        tenantPolicyId: tenantPolicy.id,
        tenantPolicyName: tenantPolicy.normalizedName,
      },
    });
  }

  function applyManualMatch(baselinePolicyId: string, tenantPolicyId: string): void {
    const baselinePolicy = effectiveBaseline.policies.find((policy) => policy.id === baselinePolicyId);
    const tenantPolicy = effectiveTenant.policies.find((policy) => policy.id === tenantPolicyId);
    if (!baselinePolicy || !tenantPolicy) return;
    void applyDecisions({
      ...matchDecisions,
      [baselinePolicy.normalizedName]: {
        action: 'manual',
        baselinePolicyName: baselinePolicy.normalizedName,
        tenantPolicyId: tenantPolicy.id,
        tenantPolicyName: tenantPolicy.normalizedName,
      },
    });
  }

  function rejectSuggestedMatch(baselinePolicyId: string): void {
    const baselinePolicy = effectiveBaseline.policies.find((policy) => policy.id === baselinePolicyId);
    if (!baselinePolicy) return;
    void applyDecisions({
      ...matchDecisions,
      [baselinePolicy.normalizedName]: {
        action: 'reject',
        baselinePolicyName: baselinePolicy.normalizedName,
      },
    });
  }

  async function signInToGraph(): Promise<void> {
    setNotice(null);
    const resolvedClientId = graphConfig.useSharedClient ? sharedGraphRegistration?.clientId ?? '' : graphConfig.clientId.trim();
    if (!resolvedClientId) {
      showNotice('error', graphConfig.useSharedClient ? 'No shared app registration is configured yet.' : 'Enter the Microsoft Entra application client ID before signing in.');
      return;
    }

    await beginGraphSignIn({
      clientId: resolvedClientId,
      tenantId: graphConfig.tenantId.trim() || 'organizations',
      redirectUri: window.location.origin + window.location.pathname,
      scopes: graphDefaultScopes,
    });
  }

  async function loadTenantFromGraph(): Promise<void> {
    const worker = workerRef.current;
    const token = getStoredGraphToken() ?? graphToken;
    if (!token || !worker) {
      showNotice('error', 'Sign in to Microsoft Graph before fetching tenant policies.');
      return;
    }

    setIsBusy(true);
    setProgressMessage('');
    setNotice(null);
    try {
      const graphIssues: TenantImport['issues'] = [];
      const graphDiagnostics: TenantImport['diagnostics'] = [];
      const tenantDocuments = await fetchGraphSourceDocuments(token, graphIssues, graphDiagnostics, graphConfig.includeAssignments);
      const baselineDocuments = baselineUpload.files.length > 0 ? await filesToDocuments(baselineUpload.files) : null;
      const parsed = await worker.parseImports(
        {
          tenant: {
            tenant: 'B',
            tenantName: graphConfig.tenantName.trim() || 'Graph tenant',
            prefix: graphConfig.prefix,
            documents: tenantDocuments,
          },
          baseline: {
            tenant: 'Baseline',
            tenantName: baselineUpload.tenantName.trim() || baseline.tenantName || 'Baseline',
            prefix: baselineUpload.prefix || baseline.prefix,
            documents: baselineDocuments ?? [],
          },
        },
        (_stage, message) => setProgressMessage(message),
      );
      setTenant({
        ...parsed.tenant,
        issues: [...graphIssues, ...parsed.tenant.issues],
        diagnostics: [...graphDiagnostics, ...parsed.tenant.diagnostics],
      });
      setBaseline(baselineDocuments ? parsed.baseline : baseline);
      setPage('review');
      showNotice('success', 'Tenant policies fetched from Microsoft Graph and parsed for review.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Microsoft Graph fetch failed.');
    } finally {
      setIsBusy(false);
      setProgressMessage('');
    }
  }

  function clearAll(): void {
    setTenantUpload(initialTenant);
    setBaselineUpload(initialBaseline);
    setTenant(emptyImport('B', 'Tenant'));
    setBaseline(emptyImport('Baseline', 'Baseline'));
    setExcludedPolicyIds([]);
    setComparison(null);
    setBaselineResult(null);
    setMatchDecisions({});
    setNotice(null);
    setQuery('');
    setSelectedPolicyId(null);
    setCompareFilter('all');
    setProgressMessage('');
  }

  function signOutGraph(): void {
    clearGraphToken();
    setGraphToken(null);
    showNotice('info', 'Microsoft Graph session cleared.');
  }

  const exportHtml = (): void => {
    if (!comparison) return;
    const reportHtml = generateTenantHtmlReport(comparison, baselineResult ?? undefined);
    const download = downloadTextFile(exportName('report', 'html'), reportHtml, 'text/html;charset=utf-8');
    const opened = window.open(download.url, '_blank', 'noopener,noreferrer');
    showNotice(opened ? 'success' : 'info', opened ? 'Interactive HTML report opened in a new tab and downloaded.' : 'HTML report downloaded. Allow popups to open the interactive report automatically.');
  };

  const printReportAsPdf = (): void => {
    if (!comparison) return;
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) {
      showNotice('error', 'Popup blocker prevented opening the print-ready report. Allow popups and try again.');
      return;
    }
    reportWindow.document.write(generateTenantHtmlReport(comparison, baselineResult ?? undefined));
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.print();
    showNotice('success', 'Print dialog opened. Choose Save as PDF to export a PDF copy.');
  };

  const exportJson = (): void => {
    if (!comparison) return;
    downloadTextFile(exportName('result', 'json'), JSON.stringify({ comparison, baseline: baselineResult, imports: { baseline, tenant } }, null, 2), 'application/json');
    showNotice('success', 'JSON result exported.');
  };

  const exportMatchMap = (): void => {
    downloadTextFile(exportName('match-map', 'json'), JSON.stringify(matchDecisions, null, 2), 'application/json');
    showNotice('success', 'Match decision profile exported.');
  };

  const importMatchMap = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const imported = await readJsonFileInput<MatchDecisionMap>(file);
      if (!comparison) {
        setMatchDecisions(imported);
        showNotice('success', 'Match decision profile loaded.');
        return;
      }
      await applyDecisions(imported);
    } catch (error) {
      showNotice('error', error instanceof Error ? `Could not import match map: ${error.message}` : 'Could not import match map.');
    }
  };

  const exportCsv = (): void => {
    if (!comparison) return;
    downloadTextFile(exportName('result', 'csv'), comparisonToCsv(comparison), 'text/csv');
    showNotice('success', 'CSV result exported.');
  };

  return (
    <div className="app-shell min-h-screen bg-background text-foreground">
      <header className="command-header sticky top-0 z-20 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <IntuneCookerLogo compact className="max-w-fit" />
            <h1 className="text-2xl font-bold tracking-normal lg:text-3xl">Baseline drift review for Microsoft Intune</h1>
          </div>
          <Tabs value={page} items={navItems} onChange={setPage} />
        </div>
      </header>

      <main className="app-main mx-auto max-w-7xl px-5 py-8">
        <div className="mb-5 space-y-3">
          <NotificationBanner notice={notice} />
          {isBusy && progressMessage ? (
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">{progressMessage}</div>
          ) : null}
        </div>

        <Suspense fallback={<LoadingPanel />}>
          {page === 'home' ? (
          <div className="space-y-8">
            <section className="landing-hero">
              <div className="landing-hero__copy">
                <div className="landing-chip">
                  <span>Intune drift command center</span>
                  <Badge variant="secondary">Local-first</Badge>
                </div>
                <IntuneCookerLogo className="landing-wordmark" />
                <div className="landing-headline">
                  <h2>Cut through Intune export noise and produce an assessment people can actually use.</h2>
                  <p>
                    IntuneCooker is built for consultants and tenant engineers who need a baseline-vs-tenant review flow, not another JSON blob viewer. Import
                    exports, challenge parser quality, approve uncertain matches, and ship a report with defensible drift evidence.
                  </p>
                </div>
                <div className="landing-actions">
                  <Button className="h-12 px-5 text-base" onClick={() => setPage('import')}>
                    Start with JSON upload
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button className="h-12 px-5 text-base" variant="outline" onClick={() => setPage('graph')}>
                    Open Graph connector
                  </Button>
                </div>
                <div className="landing-proof-rail">
                  {homeSignals.map((signal) => (
                    <div className="landing-proof" key={signal.label}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="landing-hero__visual">
                <div className="signal-frame">
                  <div className="signal-frame__glow" />
                  <div className="signal-frame__stats">
                    <div>
                      <span>Assessment stance</span>
                      <strong>Baseline-first</strong>
                    </div>
                    <div>
                      <span>Primary deliverable</span>
                      <strong>Interactive HTML report</strong>
                    </div>
                    <div>
                      <span>Operator control</span>
                      <strong>Manual match decisions</strong>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="landing-band">
              <div className="landing-band__intro">
                <span>Why it exists</span>
                <h3>Most Intune comparison tools stop at raw differences. This one is designed around review quality.</h3>
              </div>
              <div className="landing-capability-grid">
                {homeCapabilities.map((capability) => (
                  <article className="landing-capability" key={capability.title}>
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    <h4>{capability.title}</h4>
                    <p>{capability.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="landing-band landing-band--split">
              <div className="landing-section-copy">
                <span>Workflow</span>
                <h3>A deliberate assessment pipeline instead of one-click guesswork.</h3>
                <p>
                  The app separates import quality, matching decisions, and final drift reporting so you can challenge the data before you accept the conclusion.
                </p>
              </div>
              <div className="landing-workflow">
                {homeWorkflow.map((item) => (
                  <article className="landing-step" key={item.step}>
                    <div className="landing-step__index">{item.step}</div>
                    <div>
                      <h4>{item.title}</h4>
                      <p>{item.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="landing-band landing-band--triple">
              <div className="landing-panel">
                <div className="landing-panel__eyebrow">
                  <Lock className="h-4 w-4 text-primary" />
                  Privacy posture
                </div>
                <h3>Tenant data stays with the operator.</h3>
                <p>JSON imports are processed in browser memory. Graph mode fetches tenant data with delegated auth, then keeps parsing and comparison local.</p>
                <div className="landing-badges">
                  <Badge variant="success">JSON mode is fully client-side</Badge>
                  <Badge variant="secondary">Graph fetch is tenant-side only</Badge>
                </div>
              </div>

              <div className="landing-panel">
                <div className="landing-panel__eyebrow">
                  <Download className="h-4 w-4 text-primary" />
                  Deliverables
                </div>
                <h3>Assessment output that survives handover.</h3>
                <ul className="landing-list">
                  {homeDeliverables.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="landing-panel landing-panel--callout">
                <div className="landing-panel__eyebrow">
                  <GitCompareArrows className="h-4 w-4 text-primary" />
                  Start path
                </div>
                <h3>Bring your baseline library first.</h3>
                <p>Upload the policies you consider authoritative, then compare a live tenant or exported tenant package against that reference set.</p>
                <div className="landing-inline-actions">
                  <Button onClick={() => setPage('import')}>Open import workflow</Button>
                  <Button variant="ghost" onClick={() => setPage('privacy')}>
                    Review privacy model
                  </Button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {page === 'import' ? (
          <div className="space-y-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <UploadCard title="Tenant policies" state={tenantUpload} onChange={setTenantUpload} />
              <UploadCard title="Baseline policies" state={baselineUpload} onChange={setBaselineUpload} />
            </div>
            <Card className="glass-panel">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold">Prepare sources</div>
                    <div className="text-sm text-muted-foreground">
                      Tenant: {tenantUpload.files.length} file{tenantUpload.files.length === 1 ? '' : 's'} · Baseline:{' '}
                      {baselineUpload.files.length} file{baselineUpload.files.length === 1 ? '' : 's'} · Saved decisions:{' '}
                      {Object.keys(matchDecisions).length}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold">
                      <input checked={fuzzyEnabled} type="checkbox" onChange={(event) => setFuzzyEnabled(event.target.checked)} />
                      Fuzzy matching
                    </label>
                    <Button variant="outline" onClick={clearAll}>
                      Clear all imported data
                    </Button>
                    <Button disabled={tenantUpload.files.length === 0 || baselineUpload.files.length === 0 || isBusy} onClick={() => void parseCurrentSources()}>
                      {isBusy ? 'Parsing...' : 'Parse imports'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {page === 'review' ? (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <SummaryCard label="Tenant policies" value={tenant.policies.length} icon={<FileJson className="h-5 w-5" />} />
              <SummaryCard label="Baseline policies" value={baseline.policies.length} icon={<ShieldCheck className="h-5 w-5" />} />
              <SummaryCard label="Excluded policies" value={excludedPolicyIds.length} icon={<AlertTriangle className="h-5 w-5" />} />
              <SummaryCard label="Hard import errors" value={[...tenant.issues, ...baseline.issues].filter((issue) => issue.severity === 'error').length} icon={<AlertTriangle className="h-5 w-5" />} />
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <ImportReviewPanel
                title={baseline.tenantName}
                diagnostics={baseline.diagnostics}
                issues={baseline.issues}
                policies={baseline.policies}
                excludedPolicyIds={excludedPolicyIds}
                onTogglePolicy={toggleExcludedPolicy}
              />
              <ImportReviewPanel
                title={tenant.tenantName}
                diagnostics={tenant.diagnostics}
                issues={tenant.issues}
                policies={tenant.policies}
                excludedPolicyIds={excludedPolicyIds}
                onTogglePolicy={toggleExcludedPolicy}
              />
            </div>
            <Card className="glass-panel">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <div className="font-semibold">Ready for assessment</div>
                  <div className="text-sm text-muted-foreground">
                    {effectiveTenant.policies.length} tenant policies and {effectiveBaseline.policies.length} baseline policies remain in scope.
                  </div>
                </div>
                <Button disabled={!canRunComparison(effectiveTenant, effectiveBaseline) || isBusy} onClick={() => void generateAssessment()}>
                  {isBusy ? 'Generating...' : 'Run assessment'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {page === 'matches' ? (
          <div className="space-y-5">
            {!comparison ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">Run an assessment first to review candidate matches.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4">
                  <SummaryCard label="Unresolved matches" value={comparison.summary.possibleMatches} icon={<GitCompareArrows className="h-5 w-5" />} />
                  <SummaryCard label="Missing baseline policies" value={comparison.summary.onlyInA} icon={<FileJson className="h-5 w-5" />} />
                  <SummaryCard label="Extra tenant policies" value={comparison.summary.onlyInB} icon={<AlertTriangle className="h-5 w-5" />} />
                  <SummaryCard label="Confirmed matches" value={comparison.summary.matchedPolicies} icon={<CheckCircle2 className="h-5 w-5" />} />
                </div>
                <MatchReviewPanel
                  matches={comparison.matches}
                  tenantPolicies={effectiveTenant.policies}
                  onAccept={acceptSuggestedMatch}
                  onManual={applyManualMatch}
                  onReject={rejectSuggestedMatch}
                />
                <Card className="glass-panel">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div>
                      <div className="font-semibold">Proceed to assessment view</div>
                      <div className="text-sm text-muted-foreground">You can review unresolved candidates later; the assessment view separates them from confirmed drift.</div>
                    </div>
                    <Button onClick={() => setPage('compare')}>Open assessment</Button>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        ) : null}

        {page === 'compare' ? (
          <div className="space-y-5">
            {!comparison ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">Parse imports and run an assessment first.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
                  <SummaryCard label="Coverage" value={`${baselineResult?.policyCoveragePercent ?? 0}%`} icon={<BarChart3 className="h-5 w-5" />} />
                  <SummaryCard label="Drifted policies" value={comparison.summary.driftPolicies} icon={<AlertTriangle className="h-5 w-5" />} />
                  <SummaryCard label="Unsupported" value={comparison.summary.unsupportedPolicies} icon={<FileJson className="h-5 w-5" />} />
                  <SummaryCard label="Review matches" value={comparison.summary.possibleMatches} icon={<GitCompareArrows className="h-5 w-5" />} />
                  <SummaryCard label="Translated settings" value={comparison.summary.translatedSettings} icon={<ShieldCheck className="h-5 w-5" />} />
                  <SummaryCard label="Unknown settings" value={comparison.summary.unknownSettings} icon={<Search className="h-5 w-5" />} />
                </div>

                <Card className="glass-panel">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">Assessment groups</div>
                        <div className="text-sm text-muted-foreground">Review unsupported and unresolved items separately from confirmed drift.</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => void generateAssessment(matchDecisions)}>
                          Recompute
                        </Button>
                        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" />CSV</Button>
                        <Button variant="outline" onClick={exportJson}><Download className="h-4 w-4" />JSON</Button>
                        <Button variant="outline" onClick={exportMatchMap}><Download className="h-4 w-4" />Decision profile</Button>
                        <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-semibold hover:bg-muted">
                          Import decision profile
                          <input
                            className="hidden"
                            type="file"
                            accept=".json,application/json"
                            onChange={(event) => {
                              void importMatchMap(event.target.files?.[0]);
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>
                        <Button variant="outline" onClick={printReportAsPdf}><Download className="h-4 w-4" />Print/PDF</Button>
                        <Button onClick={exportHtml}><Download className="h-4 w-4" />HTML report</Button>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-7">
                      {([
                        ['unsupported', 'Unsupported'],
                        ['missingPolicy', 'Missing policy'],
                        ['review', 'Review match'],
                        ['drift', 'Confirmed drift'],
                        ['compliant', 'Compliant'],
                        ['extra', 'Extra tenant'],
                        ['all', 'All'],
                      ] as [CompareFilter, string][]).map(([value, label]) => (
                        <button
                          className={`rounded-lg border p-3 text-left shadow-sm transition-all ${
                            compareFilter === value ? 'border-primary bg-cyan-950/60 text-primary shadow-md' : 'bg-card hover:-translate-y-0.5 hover:bg-muted hover:shadow-md'
                          }`}
                          key={value}
                          type="button"
                          onClick={() => setCompareFilter(value)}
                        >
                          <div className="text-lg font-bold">{outcomeCounts[value]}</div>
                          <div className="text-xs font-semibold">{label}</div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-5 lg:grid-cols-[.9fr_1.4fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle>Assessment queue</CardTitle>
                      <CardDescription>{filteredMatches.length} policies in the current group</CardDescription>
                    </CardHeader>
                    <CardContent className="max-h-[720px] space-y-2 overflow-auto">
                      {filteredMatches.map((match) => {
                        const counts = matchSettingCounts(match);
                        const drift = counts.different + counts.missingInTenant;
                        const status = assessmentStatus(match);
                        return (
                          <button
                            className={`w-full rounded-lg border p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-md ${
                              selectedPolicyId === match.id ? 'border-primary bg-cyan-950/60' : 'bg-card'
                            }`}
                            key={match.id}
                            onClick={() => setSelectedPolicyId(match.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold">{match.policyA?.displayName ?? match.policyB?.displayName ?? match.normalizedName}</span>
                              <Badge variant={statusVariant(status)}>{assessmentLabel(status)}</Badge>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">{match.normalizedName}</div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {status === 'review' ? (
                                <Badge variant="warning">{match.candidateMatches.length} candidates</Badge>
                              ) : (
                                <>
                                  <Badge variant={drift > 0 ? 'warning' : 'success'}>{drift} drift</Badge>
                                  <Badge variant="secondary">{counts.matching} matching</Badge>
                                </>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>
                  {selectedMatch ? (
                    <PolicyDetailsCard
                      match={selectedMatch}
                      leftLabel={comparison.tenantAName}
                      rightLabel={comparison.tenantBName}
                      tenantPolicies={effectiveTenant.policies}
                      onManualMatch={applyManualMatch}
                      onRejectMatch={rejectSuggestedMatch}
                      onNotice={showNotice}
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {page === 'search' ? (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Global setting search</CardTitle>
                <CardDescription>Search by human-readable label, raw path, value, or policy identity across all parsed imports.</CardDescription>
              </CardHeader>
              <CardContent>
                <Input placeholder="Search setting label, raw path, value, or policy" value={query} onChange={(event) => setQuery(event.target.value)} />
              </CardContent>
            </Card>
            <div className="space-y-3">
              {searchResults.map((result) => (
                <Card key={`${result.policy.id}-${result.setting?.id ?? result.matchReason}-${result.matchedField}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap justify-between gap-2">
                      <div>
                        <div className="font-semibold">{result.policy.displayName}</div>
                        <div className="text-sm text-muted-foreground">{result.setting?.normalizedPath ?? result.policy.policyType}</div>
                      </div>
                      <Badge variant="secondary">
                        {result.policy.sourceTenant} · {result.matchedField}
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm">{result.matchReason}: {result.valuePreview}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : null}

        {page === 'privacy' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lock className="h-5 w-5" />Security and privacy</CardTitle>
              <CardDescription>IntuneCooker remains local-first for import, comparison, and reporting.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {[
                'Uploaded JSON files are processed locally in the browser.',
                'No tenant data is uploaded to a backend in JSON mode.',
                'No telemetry is sent by default.',
                'Imported data is kept only in current browser memory.',
                'Use Clear all imported data to reset the app state.',
                'Graph mode uses delegated Microsoft authentication and still compares locally.',
              ].map((item) => <div className="rounded-md border p-3" key={item}>{item}</div>)}
            </CardContent>
          </Card>
        ) : null}

        {page === 'graph' ? (
          <GraphConnectorPanel
            config={graphConfig}
            sharedAppName={sharedGraphRegistration?.appName ?? 'Shared registration'}
            sharedClientAvailable={sharedGraphRegistration !== null}
            graphSignedInLabel={
              graphToken
                ? `Signed in${graphToken.accountName ? ` as ${graphToken.accountName}` : ''}. Token is stored in session memory only.`
                : sharedGraphRegistration
                  ? `Not signed in. Ready to use ${sharedGraphRegistration.appName}.`
                  : 'Not signed in. Configure a shared or custom SPA app registration, then connect.'
            }
            isGraphBusy={isBusy}
            onConfigChange={setGraphConfig}
            onSignIn={() => void signInToGraph()}
            onFetch={() => void loadTenantFromGraph()}
            onSignOut={signOutGraph}
          />
        ) : null}
        </Suspense>
      </main>
    </div>
  );
}
