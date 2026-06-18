# IntuneBabo

IntuneBabo is a clean-room, static-first web app for comparing Microsoft Intune configuration exports. It is inspired by the general workflow of Intune diffing tools, but does not copy branding, text, layout, protected assets, or proprietary implementation.

## What It Does

- Upload multiple JSON exports for one tenant and one baseline.
- Normalize policy names and remove customer-specific prefixes.
- Match baseline policies to tenant policies by exact normalized name or optional fuzzy matching.
- Compare settings side by side by normalized setting path.
- Identify found baseline policies, missing baseline policies, extra tenant policies, changed settings, and identical settings.
- Search across policy names, setting names, paths, and values.
- Compare tenant policies against uploaded baseline policies.
- Sign in to Microsoft Graph and fetch tenant Intune policies directly.
- Export HTML, JSON, CSV, and print-ready PDF reports through the browser print dialog.
- Process tenant data locally in the browser in JSON mode.

## Privacy

JSON mode is fully client-side:

- Uploaded files are parsed in browser memory.
- Tenant data is not uploaded to a backend.
- No telemetry is sent by default.
- There is no server-side storage.
- Use **Clear all imported data** to reset browser memory state.

Graph mode uses delegated Microsoft sign-in from the browser:

- No client secret is used or stored.
- Access tokens are kept in session storage only.
- Fetched Graph policy data is processed locally in browser memory.
- Baseline files remain local JSON uploads.

Recommended Graph setup:

- Create one **shared multitenant SPA app registration** for IntuneBabo.
- Reuse that same app registration across customer tenants.
- Have each customer tenant admin grant consent when needed.
- Do not create a new app registration per tenant unless you have a specific isolation requirement.

## Local Setup

```bash
npm install
npm run dev
```

Optional shared Graph registration config in `.env.local`:

```bash
VITE_GRAPH_SHARED_CLIENT_ID=00000000-0000-0000-0000-000000000000
VITE_GRAPH_SHARED_TENANT_ID=organizations
VITE_GRAPH_SHARED_APP_NAME=IntuneBabo shared app registration
```

Build and verify:

```bash
npm run typecheck
npm run test
npm run build
```

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow for GitHub Pages. To publish it:

1. Push the app to GitHub.
2. In the repository settings, open **Pages**.
3. Set **Build and deployment** to **GitHub Actions**.
4. Push to `main` or `master`, or run the **Deploy to GitHub Pages** workflow manually.

The workflow runs `npm ci`, `npm run typecheck`, `npm run test`, and `npm run build`, then uploads `dist/` to Pages. It sets `VITE_BASE_PATH` to `/${repoName}/` so Vite assets resolve correctly on project pages such as `https://USERNAME.github.io/IntuneBabo/`.

For a custom domain or user/organization page, override `VITE_BASE_PATH` to `/` in the workflow build step.

## Supported JSON Formats

IntuneBabo accepts tenant and baseline files in these shapes:

- A single Intune policy JSON object.
- A JSON array of policy objects.
- A Microsoft Graph response object with a `value` array.
- UTF-8 and UTF-16 JSON files, including PowerShell exports.

The parser currently supports:

- Intune Settings Catalog policy exports.
- Device configuration style exports where comparable settings can be identified.
- Generic fallback parsing for unknown Intune JSON structures.

## Matching and Normalization

Policy names are normalized by:

- Lowercasing.
- Trimming spaces.
- Removing configured tenant prefixes.
- Replacing separators such as `-`, `_`, `|`, and `:` with spaces.
- Collapsing repeated whitespace.

Example:

```text
ACME - WIN - Security Baseline - Defender
Security Baseline - Defender
```

With prefix `ACME`, both normalize to:

```text
win security baseline defender
```

## Architecture

```text
src/
  components/
    ui/
  lib/
    comparison/
    export/
    graph/
    normalization/
    parsers/
  types/
  tests/
  utils/
```

Important abstractions:

- `IPolicyProvider`
- `JsonPolicyProvider`
- `GraphPolicyProvider`
- `graphAuth` OAuth PKCE helper
- `NormalizedPolicy`
- `NormalizedSetting`
- `TenantComparisonResult`

The comparison engine is independent from React, so JSON uploads and Microsoft Graph fetches feed the same normalized model.

## Microsoft Graph Connector

The Graph connector is implemented as a static SPA flow using Microsoft identity platform authorization code + PKCE.

Preferred model:

- one shared multitenant Microsoft Entra app registration
- configured once for the app
- reused across tenants

Shared app registration requirements:

- Platform: Single-page application.
- Redirect URI: the local or deployed app URL shown on the Graph page.
- No client secret.
- Delegated API permission: `DeviceManagementConfiguration.Read.All`.
- Admin consent is typically required in each customer tenant.

Fallback model:

- You can still switch to a custom client ID override on the Graph page.
- This is useful for testing or isolated customer-specific app registrations.

Implemented Graph fetches:

- `GET /beta/deviceManagement/configurationPolicies?$expand=settings`
- optional `GET /beta/deviceManagement/configurationPolicies?$expand=settings,assignments` for raw assignment payloads
- `GET /v1.0/deviceManagement/deviceConfigurations`
- `GET /v1.0/deviceManagement/deviceCompliancePolicies`
- `GET /v1.0/deviceAppManagement/managedAppPolicies`

Settings Catalog and security baseline policies use Graph beta because expanded settings are not consistently available in v1.0.

Required permission:

- `DeviceManagementConfiguration.Read.All`

Future Graph permissions:

- `Directory.Read.All` only if assignment group names are resolved.
- `DeviceManagementManagedDevices.Read.All` only if managed device or compliance device state is added.

Future Graph fetch areas:

- Assignment group display-name resolution.
- Additional security baseline metadata if exposed by Graph.

## Known Limitations

- Fuzzy matching is token-based and intentionally conservative.
- Unknown policy schemas use fallback parsing and may produce broad setting paths.
- Baseline mode compares uploaded baseline JSON only.
- Print/PDF export depends on the browser print dialog rather than direct binary PDF generation.
- Raw Graph assignment payload fetch is available for configuration policies, but assignment group display-name resolution is not implemented yet.
- Graph Settings Catalog fetch uses Microsoft Graph beta.

## Roadmap

- Assignment group display-name resolution.
- Advanced fuzzy match review workflow.
- Native binary PDF generation.
- Azure Static Web Apps deployment.
