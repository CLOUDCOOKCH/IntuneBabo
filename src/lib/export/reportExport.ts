import type { BaselineComparisonResult, PolicyMatch, SettingComparison, TenantComparisonResult } from '../../types/tenantdiff';
import intuneCookerLogoInline from '../../assets/intunecooker-logo.svg?inline';
import { formatSettingValue } from '../normalization/settingDictionary';
import { previewValue } from '../parsers/intuneJsonParser';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

function policyStatusLabel(status: PolicyMatch['status']): string {
  if (status === 'onlyInA') return 'Missing baseline policy';
  if (status === 'onlyInB') return 'Extra tenant policy';
  if (status === 'possible') return 'Candidate match requires review';
  return 'Found';
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

function noComparableSettings(match: PolicyMatch): boolean {
  return (
    match.settingComparisons.length === 0 &&
    [match.policyA, match.policyB].some((policy) => policy?.warnings.some((warning) => warning.includes('No comparable settings found.')))
  );
}

function policyGroup(match: PolicyMatch): 'unsupported' | 'drift' | 'missing' | 'possible' | 'compliant' | 'extra' {
  if (noComparableSettings(match)) return 'unsupported';
  if (match.status === 'onlyInA') return 'missing';
  if (match.status === 'onlyInB') return 'extra';
  if (match.status === 'possible') return 'possible';
  if (match.settingComparisons.some((setting) => setting.status === 'different' || setting.status === 'missingInB')) return 'drift';
  return 'compliant';
}

function settingDriftCount(match: PolicyMatch): number {
  return match.settingComparisons.filter((setting) => setting.status === 'different' || setting.status === 'missingInB').length;
}

function valueBlock(label: string, path: string, value: unknown): string {
  return `<div class="value-block"><div class="value-label">${escapeHtml(label)}</div><pre>${escapeHtml(formatSettingValue(path, value))}</pre></div>`;
}

function settingCard(setting: SettingComparison, baselineLabel: string, tenantLabel: string): string {
  const status = setting.status;
  const copyValue = `${setting.displayName}\n${setting.settingPath}\n${baselineLabel}: ${previewValue(
    setting.tenantAValue ?? null,
  )}\n${tenantLabel}: ${previewValue(setting.tenantBValue ?? null)}`;
  return `<article class="setting-card ${escapeAttr(status)}" data-setting-text="${escapeAttr(
    `${setting.displayName} ${setting.settingPath} ${previewValue(setting.tenantAValue ?? null)} ${previewValue(setting.tenantBValue ?? null)}`.toLocaleLowerCase(),
  )}">
    <div class="setting-head">
      <div>
        <h4>${escapeHtml(setting.displayName)}</h4>
        <code>${escapeHtml(setting.settingPath)}</code>
      </div>
      <div class="setting-actions">
        <span class="pill ${escapeAttr(status)}">${escapeHtml(settingStatusLabel(status))}</span>
        <button type="button" class="copy-btn" data-copy="${escapeAttr(copyValue)}">Copy</button>
      </div>
    </div>
    <div class="values">
      ${valueBlock(baselineLabel, setting.settingPath, setting.tenantAValue)}
      ${valueBlock(tenantLabel, setting.settingPath, setting.tenantBValue)}
    </div>
  </article>`;
}

function policyCard(match: PolicyMatch, result: TenantComparisonResult): string {
  const driftCount = settingDriftCount(match);
  const matchingCount = match.settingComparisons.filter((setting) => setting.status === 'identical').length;
  const group = policyGroup(match);
  const visibleSettings = match.settingComparisons.filter((setting) => setting.status !== 'identical');
  const settingsHtml =
    visibleSettings.length > 0
      ? visibleSettings.map((setting) => settingCard(setting, result.tenantAName, result.tenantBName)).join('')
      : noComparableSettings(match)
        ? '<p class="empty">No comparable settings were parsed for this policy. Review the source JSON and import diagnostics.</p>'
        : '<p class="empty">No setting drift was detected for this policy.</p>';
  const candidateHtml =
    match.status === 'possible' && match.candidateMatches.length > 0
      ? `<div class="candidate-list">${match.candidateMatches
          .map(
            (candidate) =>
              `<div class="candidate"><strong>${escapeHtml(candidate.tenantPolicyName)}</strong><span>${Math.round(candidate.confidence * 100)}% confidence</span></div>`,
          )
          .join('')}</div>`
      : '';

  return `<section class="policy-card" data-group="${group}" data-text="${escapeAttr(
    `${match.policyA?.displayName ?? ''} ${match.policyB?.displayName ?? ''} ${match.normalizedName}`.toLocaleLowerCase(),
  )}">
    <div class="policy-summary">
      <div>
        <div class="eyebrow">${escapeHtml(policyStatusLabel(match.status))} · ${Math.round(match.confidence * 100)}% confidence</div>
        <h3>${escapeHtml(match.policyA?.displayName ?? match.policyB?.displayName ?? match.normalizedName)}</h3>
        <p>${escapeHtml(match.normalizedName)}</p>
      </div>
      <div class="policy-metrics">
        <span><strong>${driftCount}</strong> drift</span>
        <span><strong>${matchingCount}</strong> matching</span>
      </div>
    </div>
    <div class="policy-pair">
      <div><span>${escapeHtml(result.tenantAName)}</span>${escapeHtml(match.policyA?.displayName ?? 'Missing')}</div>
      <div><span>${escapeHtml(result.tenantBName)}</span>${escapeHtml(match.policyB?.displayName ?? 'Missing')}</div>
    </div>
    ${candidateHtml}
    <details ${group === 'drift' || group === 'missing' ? 'open' : ''}>
      <summary>Review setting evidence</summary>
      <div class="settings">${settingsHtml}</div>
    </details>
  </section>`;
}

function metricCard(label: string, value: string | number, tone = ''): string {
  return `<div class="metric ${tone}"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function reportLogo(): string {
  return `<div class="report-brand-mark" aria-hidden="true"><img src="${intuneCookerLogoInline}" alt=""></div>`;
}

function riskScore(data: ReturnType<typeof buildReportData>): number {
  const driftWeight = Math.min(45, data.driftSettings * 2);
  const missingWeight = Math.min(35, data.missingPolicies.length * 8);
  const possibleWeight = Math.min(15, data.possibleMatches.length * 3);
  const extraWeight = Math.min(10, data.extraPolicies.length * 2);
  return Math.min(100, driftWeight + missingWeight + possibleWeight + extraWeight);
}

function riskLabel(score: number): string {
  if (score >= 70) return 'High drift exposure';
  if (score >= 35) return 'Moderate drift exposure';
  if (score > 0) return 'Low drift exposure';
  return 'No material drift';
}

function topDriftPolicies(matches: PolicyMatch[]): string {
  const ranked = [...matches]
    .map((match) => ({ match, count: settingDriftCount(match) }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  if (ranked.length === 0) return '<li>No setting drift detected.</li>';

  return ranked
    .map(
      ({ match, count }) =>
        `<li><span>${escapeHtml(match.policyA?.displayName ?? match.normalizedName)}</span><strong>${count}</strong></li>`,
    )
    .join('');
}

function buildReportData(result: TenantComparisonResult, baseline?: BaselineComparisonResult) {
  const changedSettings = result.matches.flatMap((match) =>
    match.settingComparisons.filter((setting) => setting.status !== 'identical'),
  );
  const missingPolicies = result.matches.filter((match) => match.status === 'onlyInA');
  const possibleMatches = result.matches.filter((match) => match.status === 'possible');
  const extraPolicies = result.matches.filter((match) => match.status === 'onlyInB');
  const unsupportedPolicies = result.matches.filter((match) => policyGroup(match) === 'unsupported');
  const driftPolicies = result.matches.filter((match) => policyGroup(match) === 'drift');
  const compliantPolicies = result.matches.filter((match) => policyGroup(match) === 'compliant');

  return {
    changedSettings,
    missingPolicies,
    possibleMatches,
    extraPolicies,
    unsupportedPolicies,
    driftPolicies,
    compliantPolicies,
    policyCoverage: baseline?.policyCoveragePercent ?? result.summary.matchedPolicies,
    settingCoverage: baseline?.settingCoveragePercent ?? result.summary.identicalSettings,
    driftSettings: baseline?.driftSettings ?? changedSettings.length,
  };
}

export function generateTenantHtmlReport(result: TenantComparisonResult, baseline?: BaselineComparisonResult): string {
  const data = buildReportData(result, baseline);
  const score = riskScore(data);
  const generatedAt = new Date(result.generatedAt).toLocaleString();
  const policyCards = result.matches.map((match) => policyCard(match, result)).join('');
  const missingPolicyList =
    data.missingPolicies.length > 0
      ? data.missingPolicies
          .map((match) => `<li>${escapeHtml(match.policyA?.displayName ?? match.normalizedName)}</li>`)
          .join('')
      : '<li>No missing baseline policies.</li>';
  const unsupportedPolicyList =
    data.unsupportedPolicies.length > 0
      ? data.unsupportedPolicies.map((match) => `<li>${escapeHtml(match.policyA?.displayName ?? match.normalizedName)}</li>`).join('')
      : '<li>No unsupported or incomplete policies.</li>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IntuneCooker Report</title>
  <style>
    :root{
      --bg:#06101d;--panel:#0d1b2c;--panel-2:#10243a;--ink:#e8f7ff;--muted:#9eb2c4;--line:#155369;
      --cyan:#12d8e8;--amber:#ffbf47;--red:#ff6a5f;--green:#4ee0a4;--blue:#8ab4ff;--paper:#d7efe8;
    }
    *{box-sizing:border-box} html{scroll-behavior:smooth}
    body{margin:0;font-family:Aptos,"Aptos Display",Bahnschrift,"Segoe UI Variable",sans-serif;color:var(--ink);background:
      radial-gradient(circle at 12% -10%,rgba(18,216,232,.26),transparent 32rem),
      radial-gradient(circle at 90% 4%,rgba(255,191,71,.16),transparent 28rem),
      linear-gradient(rgba(18,216,232,.055) 1px,transparent 1px),
      linear-gradient(90deg,rgba(18,216,232,.045) 1px,transparent 1px),
      linear-gradient(180deg,#06101d,#070d17);background-size:auto,auto,42px 42px,42px 42px,auto}
    code,pre{font-family:"Cascadia Code","Cascadia Mono",Consolas,monospace}
    .shell{max-width:1260px;margin:0 auto;padding:28px 22px 64px}
    header{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:18px;padding:30px;background:
      linear-gradient(135deg,rgba(16,36,58,.96),rgba(7,17,30,.92));box-shadow:0 24px 90px rgba(0,0,0,.34)}
    header:after{content:"";position:absolute;right:-140px;bottom:-180px;width:420px;height:420px;border-radius:999px;border:1px solid rgba(18,216,232,.25);
      background:repeating-conic-gradient(from 0deg,rgba(18,216,232,.18) 0 2deg,transparent 2deg 13deg);opacity:.75}
    header:before{content:"";position:absolute;inset:auto 0 0;height:6px;background:linear-gradient(90deg,var(--cyan),var(--amber),var(--red));opacity:.95}
    .brand{display:flex;align-items:center;gap:12px;color:var(--cyan);font-weight:800;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase}
    .report-brand-mark{width:52px;height:52px;flex:0 0 auto;display:grid;place-items:center;border:1px solid rgba(18,216,232,.26);border-radius:14px;background:rgba(3,8,20,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
    .report-brand-mark img{width:38px;height:38px;display:block;border-radius:11px;object-fit:cover}
    .brand-copy{display:flex;flex-direction:column;gap:2px}
    .brand-copy strong{font-size:.96rem;letter-spacing:.02em;text-transform:none;color:var(--ink)}
    .brand-copy span{display:block}
    .hero-grid{position:relative;display:grid;grid-template-columns:1fr 260px;gap:24px;align-items:end}
    h1{position:relative;margin:8px 0 8px;font-size:clamp(2.4rem,6vw,5.8rem);line-height:.88;max-width:850px;letter-spacing:-.035em}
    .lead{position:relative;max-width:820px;color:var(--muted);font-size:1.02rem;line-height:1.7}
    .risk-dial{position:relative;z-index:1;justify-self:end;width:230px;aspect-ratio:1;border-radius:999px;border:1px solid rgba(18,216,232,.32);display:grid;place-items:center;background:
      conic-gradient(var(--red) 0 ${score}%,rgba(18,216,232,.14) ${score}% 100%),radial-gradient(circle,#081421 0 58%,transparent 59%);
      box-shadow:inset 0 0 60px rgba(0,0,0,.45),0 0 40px rgba(18,216,232,.15)}
    .risk-dial div{width:66%;aspect-ratio:1;border-radius:999px;background:#06101d;display:grid;place-items:center;text-align:center;border:1px solid #17495e}
    .risk-dial strong{display:block;font-size:3.6rem;line-height:1;color:var(--ink)}.risk-dial span{display:block;color:var(--muted);font-size:.78rem;font-weight:900;text-transform:uppercase}
    .identity-strip{position:relative;display:grid;grid-template-columns:1fr auto 1fr;gap:12px;margin-top:22px;align-items:stretch}
    .identity-strip div{border:1px solid #17495e;border-radius:12px;background:#081421;padding:13px}.identity-strip span{display:block;color:var(--muted);font-size:.72rem;font-weight:900;text-transform:uppercase}.identity-strip b{display:block;margin-top:4px;font-size:1.02rem}.identity-strip .versus{display:grid;place-items:center;color:var(--amber);font-weight:900;border-color:#6f5724}
    .issue-tape{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.issue{position:relative;overflow:hidden;border:1px solid #17495e;border-radius:14px;padding:14px;background:#081421}.issue:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--cyan)}.issue.warn:before{background:var(--amber)}.issue.bad:before{background:var(--red)}.issue.good:before{background:var(--green)}.issue strong{display:block;font-size:1.6rem}.issue span{color:var(--muted);font-weight:800;font-size:.82rem}
    .toolbar{position:sticky;top:0;z-index:5;margin:18px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(6,16,29,.88);backdrop-filter:blur(18px);
      display:grid;gap:12px;grid-template-columns:1fr auto auto;align-items:center}
    .search{height:42px;width:100%;border:1px solid #1a667b;border-radius:9px;background:#081421;color:var(--ink);padding:0 14px;font:inherit}
    .filters{display:flex;flex-wrap:wrap;gap:8px}
    .report-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
    button{border:1px solid #1a667b;border-radius:8px;background:#0b1b2b;color:var(--ink);font:inherit;font-weight:800;padding:10px 12px;cursor:pointer;transition:.18s ease}
    button:hover,button.active{transform:translateY(-1px);border-color:var(--cyan);background:var(--cyan);color:#06101d;box-shadow:0 0 24px rgba(18,216,232,.22)}
    .metrics{display:grid;grid-template-columns:repeat(6,minmax(130px,1fr));gap:12px;margin:18px 0}
    .metric{border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,#10243a,#0a1728);padding:16px;min-height:104px}
    .metric strong{display:block;font-size:2rem;line-height:1;color:var(--cyan)} .metric span{display:block;margin-top:10px;color:var(--muted);font-weight:700}
    .metric.warn strong{color:var(--amber)} .metric.bad strong{color:var(--red)} .metric.good strong{color:var(--green)}
    .section-grid{display:grid;grid-template-columns:.9fr .75fr .85fr;gap:16px;margin:18px 0}
    .panel,.policy-card{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(16,36,58,.96),rgba(10,23,40,.94));box-shadow:0 18px 54px rgba(0,0,0,.24)}
    .panel{padding:18px}.panel h2{margin:0 0 10px}.panel li{margin:8px 0;color:var(--muted)}
    .ranked{list-style:none;margin:0;padding:0}.ranked li{display:grid;grid-template-columns:1fr auto;gap:10px;border-bottom:1px solid rgba(18,216,232,.14);padding:9px 0}.ranked li:last-child{border-bottom:0}.ranked strong{color:var(--amber)}
    .policy-list{display:grid;gap:12px}.policy-card{padding:16px;animation:reveal .38s ease both}
    .policy-summary{display:flex;gap:18px;justify-content:space-between;align-items:flex-start}.eyebrow{color:var(--cyan);font-size:.76rem;font-weight:900;text-transform:uppercase}
    .policy-card h3{margin:6px 0;font-size:1.22rem}.policy-card p{margin:0;color:var(--muted)}
    .policy-metrics{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.policy-metrics span,.pill{border:1px solid #245d72;border-radius:8px;background:#081421;padding:6px 8px;color:var(--muted);font-weight:800;font-size:.8rem}
    .policy-metrics strong{color:var(--ink)}.pill.different,.pill.missingInB{border-color:#806128;color:var(--amber)}.pill.missingInA{border-color:#315f88;color:var(--blue)}.pill.identical{border-color:#217456;color:var(--green)}
    .policy-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.policy-pair div{border:1px solid #17495e;border-radius:10px;background:#081421;padding:12px}.policy-pair span{display:block;color:var(--muted);font-size:.76rem;font-weight:900;text-transform:uppercase}
    .candidate-list{display:grid;gap:8px;margin:12px 0}.candidate{display:flex;justify-content:space-between;gap:10px;border:1px solid #6f5724;border-radius:10px;background:#130f08;padding:10px;font-size:.85rem}
    details{border-top:1px solid rgba(18,216,232,.18);padding-top:12px} summary{cursor:pointer;color:var(--cyan);font-weight:900}
    .settings{display:grid;gap:10px;margin-top:12px}.setting-card{border:1px solid #1a5a70;border-radius:12px;background:#07111e;padding:13px}.setting-card.different,.setting-card.missingInB{border-color:#8a6722}.setting-card h4{margin:0 0 5px}.setting-card code{display:block;color:var(--muted);font-size:.78rem;overflow-wrap:anywhere}
    .setting-head{display:flex;justify-content:space-between;gap:12px}.setting-actions{display:flex;align-items:flex-start;gap:8px}.copy-btn{padding:6px 8px;font-size:.78rem}
    .values{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.value-block{min-width:0}.value-label{color:var(--muted);font-size:.75rem;font-weight:900;text-transform:uppercase;margin-bottom:6px}
    pre{margin:0;min-height:54px;max-height:220px;overflow:auto;white-space:pre-wrap;border-radius:10px;background:#030814;color:#dff8ff;padding:11px;border:1px solid #102f42}
    .empty{color:var(--muted)}.hidden{display:none!important}.no-results{display:none;margin:26px 0;padding:24px;border:1px dashed var(--line);border-radius:14px;color:var(--muted);text-align:center}
    @keyframes reveal{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:900px){.toolbar,.section-grid,.policy-pair,.values,.hero-grid,.identity-strip{grid-template-columns:1fr}.metrics,.issue-tape{grid-template-columns:repeat(2,1fr)}.risk-dial{justify-self:start;width:180px}}
    @media print{.toolbar,.copy-btn{display:none}.policy-card{break-inside:avoid}body{background:white;color:#111}.panel,.policy-card,.metric,header{box-shadow:none}}
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div class="hero-grid">
        <div>
          <div class="brand">${reportLogo()}<div class="brand-copy"><span>Interactive HTML report</span><strong>IntuneCooker</strong></div></div>
          <h1>Baseline compliance review</h1>
          <p class="lead">Generated ${escapeHtml(generatedAt)}. This report is a self-contained drift workbook: filter, search, expand evidence, and copy setting details without sending tenant data anywhere.</p>
        </div>
        <div class="risk-dial" aria-label="Risk score ${score}">
          <div><strong>${score}</strong><span>${escapeHtml(riskLabel(score))}</span></div>
        </div>
      </div>
      <div class="identity-strip">
        <div><span>Baseline</span><b>${escapeHtml(result.tenantAName)}</b></div>
        <div class="versus">VS</div>
        <div><span>Tenant</span><b>${escapeHtml(result.tenantBName)}</b></div>
      </div>
    </header>
    <section class="issue-tape">
      <div class="issue ${data.driftSettings > 0 ? 'warn' : 'good'}"><strong>${data.driftSettings}</strong><span>settings need review</span></div>
      <div class="issue ${data.missingPolicies.length > 0 ? 'bad' : 'good'}"><strong>${data.missingPolicies.length}</strong><span>baseline policies missing</span></div>
      <div class="issue ${data.possibleMatches.length > 0 ? 'warn' : 'good'}"><strong>${data.possibleMatches.length}</strong><span>matches need validation</span></div>
      <div class="issue ${data.unsupportedPolicies.length > 0 ? 'bad' : 'good'}"><strong>${data.unsupportedPolicies.length}</strong><span>unsupported policies</span></div>
    </section>
    <div class="toolbar">
      <input id="search" class="search" placeholder="Search policies, setting names, paths, or values">
      <div class="filters" aria-label="Policy filters">
        <button class="active" data-filter="all">All</button>
        <button data-filter="drift">Drift</button>
        <button data-filter="unsupported">Unsupported</button>
        <button data-filter="missing">Missing policy</button>
        <button data-filter="possible">Possible match</button>
        <button data-filter="extra">Extra tenant</button>
        <button data-filter="compliant">Compliant</button>
      </div>
      <div class="report-actions" aria-label="Report actions">
        <button type="button" data-expand="all">Expand all</button>
        <button type="button" data-collapse="all">Collapse all</button>
      </div>
    </div>
    <section class="metrics">
      ${metricCard('Policy coverage', `${data.policyCoverage}%`, 'good')}
      ${metricCard('Setting coverage', `${data.settingCoverage}%`, 'good')}
      ${metricCard('Drift settings', data.driftSettings, data.driftSettings > 0 ? 'warn' : 'good')}
      ${metricCard('Missing policies', data.missingPolicies.length, data.missingPolicies.length > 0 ? 'bad' : 'good')}
      ${metricCard('Unsupported policies', data.unsupportedPolicies.length, data.unsupportedPolicies.length > 0 ? 'bad' : '')}
      ${metricCard('Possible matches', data.possibleMatches.length, data.possibleMatches.length > 0 ? 'warn' : '')}
      ${metricCard('Extra tenant policies', data.extraPolicies.length, data.extraPolicies.length > 0 ? 'warn' : '')}
    </section>
    <section class="section-grid">
      <div class="panel">
        <h2>Executive summary</h2>
        <p class="lead">${escapeHtml(result.tenantBName)} has ${data.driftSettings} changed or missing baseline settings across ${
          data.driftPolicies.length
        } drifted policies. ${data.compliantPolicies.length} policies are compliant with the current baseline filter.</p>
      </div>
      <div class="panel">
        <h2>Highest drift policies</h2>
        <ul class="ranked">${topDriftPolicies(result.matches)}</ul>
      </div>
      <div class="panel">
        <h2>Unsupported or incomplete</h2>
        <ul>${unsupportedPolicyList}</ul>
      </div>
      <div class="panel">
        <h2>Missing baseline policies</h2>
        <ul>${missingPolicyList}</ul>
      </div>
    </section>
    <main id="policies" class="policy-list">${policyCards}</main>
    <div id="noResults" class="no-results">No policies match the current filter and search.</div>
  </div>
  <script data-report-script="interactive-v2">
    (() => {
      const buttons = Array.from(document.querySelectorAll('[data-filter]'));
      const cards = Array.from(document.querySelectorAll('.policy-card'));
      const search = document.getElementById('search');
      const noResults = document.getElementById('noResults');
      const expandAll = document.querySelector('[data-expand="all"]');
      const collapseAll = document.querySelector('[data-collapse="all"]');
      let activeFilter = 'all';

      function searchableText(card) {
        const cardText = card.dataset.text || '';
        const settingText = Array.from(card.querySelectorAll('[data-setting-text]'))
          .map((item) => item.dataset.settingText || '')
          .join(' ');
        return cardText + ' ' + settingText;
      }

      function applyFilters() {
        const query = (search?.value || '').trim().toLowerCase();
        let visible = 0;
        cards.forEach((card) => {
          const group = card.dataset.group;
          const matchesFilter = activeFilter === 'all' || group === activeFilter;
          const matchesSearch = !query || searchableText(card).includes(query);
          const show = matchesFilter && matchesSearch;
          card.classList.toggle('hidden', !show);
          if (show) visible += 1;
        });
        if (noResults) noResults.style.display = visible === 0 ? 'block' : 'none';
      }

      buttons.forEach((button) => button.addEventListener('click', () => {
        activeFilter = button.dataset.filter || 'all';
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        applyFilters();
      }));

      search?.addEventListener('input', applyFilters);
      expandAll?.addEventListener('click', () => cards.forEach((card) => {
        if (!card.classList.contains('hidden')) card.querySelector('details')?.setAttribute('open', 'true');
      }));
      collapseAll?.addEventListener('click', () => cards.forEach((card) => card.querySelector('details')?.removeAttribute('open')));

      document.addEventListener('click', async (event) => {
        const button = event.target.closest?.('.copy-btn');
        if (!button) return;
        const text = button.dataset.copy || '';
        let copied = false;
        if (navigator.clipboard?.writeText && window.isSecureContext) {
          try {
            await navigator.clipboard.writeText(text);
            copied = true;
          } catch {
            copied = false;
          }
        }
        if (!copied) {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.setAttribute('readonly', 'true');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.append(textarea);
          textarea.select();
          try {
            copied = document.execCommand('copy');
          } catch {
            copied = false;
          }
          textarea.remove();
        }
        const old = button.textContent;
        button.textContent = copied ? 'Copied' : 'Copy failed';
        window.setTimeout(() => {
          button.textContent = old;
        }, 900);
      });

      applyFilters();
      document.documentElement.dataset.reportInteractive = 'ready';
    })();
  </script>
</body>
</html>`;
}

export function comparisonToCsv(result: TenantComparisonResult): string {
  const rows = [['Baseline policy', 'Tenant policy', 'Policy status', 'Assessment status', 'Setting path', 'Setting status', 'Baseline value', 'Tenant value']];
  result.matches.forEach((match) => {
    if (match.settingComparisons.length === 0) {
      rows.push([match.policyA?.displayName ?? '', match.policyB?.displayName ?? '', policyStatusLabel(match.status), policyGroup(match), '', '', '', '']);
      return;
    }
    match.settingComparisons.forEach((setting) => {
      rows.push([
        match.policyA?.displayName ?? '',
        match.policyB?.displayName ?? '',
        policyStatusLabel(match.status),
        policyGroup(match),
        setting.settingPath,
        setting.status,
        previewValue(setting.tenantAValue ?? null),
        previewValue(setting.tenantBValue ?? null),
      ]);
    });
  });
  return rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
}
