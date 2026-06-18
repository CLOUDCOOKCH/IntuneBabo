const authStorageKey = 'intunecooker.graph.auth';
const pendingStorageKey = 'intunecooker.graph.pendingAuth';

export interface GraphAuthConfig {
  clientId: string;
  tenantId: string;
  redirectUri: string;
  scopes: string[];
}

export interface GraphToken {
  accessToken: string;
  expiresAt: number;
  tenantId?: string;
  accountName?: string;
}

interface PendingAuth {
  verifier: string;
  state: string;
  config: GraphAuthConfig;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

function base64UrlEncode(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes.buffer);
}

async function sha256(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
}

function authBaseUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId || 'organizations')}/oauth2/v2.0`;
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStoredJson<T>(key: string): T | null {
  const storage = safeStorage();
  if (!storage) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

function writeStoredJson(key: string, value: unknown): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

function removeStored(key: string): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(key);
}

function parseJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split('.');
  if (!payload) return {};
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

export const graphDefaultScopes = [
  'openid',
  'profile',
  'https://graph.microsoft.com/DeviceManagementConfiguration.Read.All',
];

export function getStoredGraphToken(): GraphToken | null {
  const token = readStoredJson<GraphToken>(authStorageKey);
  if (!token || typeof token.accessToken !== 'string' || typeof token.expiresAt !== 'number') {
    removeStored(authStorageKey);
    return null;
  }
  if (token.expiresAt <= Date.now() + 60_000) {
    removeStored(authStorageKey);
    return null;
  }
  return token;
}

export function clearGraphToken(): void {
  removeStored(authStorageKey);
  removeStored(pendingStorageKey);
}

export async function beginGraphSignIn(config: GraphAuthConfig): Promise<void> {
  if (typeof window === 'undefined') {
    throw new Error('Microsoft Graph sign-in is only available in a browser.');
  }
  const verifier = randomString();
  const state = randomString();
  const challenge = base64UrlEncode(await sha256(verifier));
  const pending: PendingAuth = { verifier, state, config };
  writeStoredJson(pendingStorageKey, pending);

  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    redirect_uri: config.redirectUri,
    response_mode: 'query',
    scope: config.scopes.join(' '),
    state,
    prompt: 'select_account',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  window.location.assign(`${authBaseUrl(config.tenantId)}/authorize?${params.toString()}`);
}

export async function completeGraphSignInFromRedirect(): Promise<GraphToken | null> {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const errorDescription = params.get('error_description');
  if (error) {
    clearGraphToken();
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    throw new Error(errorDescription ?? error);
  }
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return getStoredGraphToken();

  const pending = readStoredJson<PendingAuth>(pendingStorageKey);
  if (!pending) {
    clearGraphToken();
    throw new Error('No pending Microsoft Graph sign-in was found.');
  }
  if (pending.state !== state) {
    clearGraphToken();
    throw new Error('Microsoft Graph sign-in state did not match.');
  }

  const body = new URLSearchParams({
    client_id: pending.config.clientId,
    scope: pending.config.scopes.join(' '),
    code,
    redirect_uri: pending.config.redirectUri,
    grant_type: 'authorization_code',
    code_verifier: pending.verifier,
  });

  const response = await fetch(`${authBaseUrl(pending.config.tenantId)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const rawBody = await response.text();
  let tokenResponse: TokenResponse = { access_token: '', expires_in: 0 };
  try {
    tokenResponse = JSON.parse(rawBody) as TokenResponse;
  } catch {
    removeStored(pendingStorageKey);
    throw new Error(response.ok ? 'Microsoft Graph sign-in returned an unreadable token response.' : 'Microsoft Graph sign-in failed with a non-JSON response.');
  }
  if (!response.ok || tokenResponse.error) {
    removeStored(pendingStorageKey);
    throw new Error(tokenResponse.error_description ?? tokenResponse.error ?? 'Microsoft Graph sign-in failed.');
  }

  const idToken = tokenResponse.id_token ? parseJwtPayload(tokenResponse.id_token) : {};
  const token: GraphToken = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
    tenantId: typeof idToken.tid === 'string' ? idToken.tid : undefined,
    accountName: typeof idToken.preferred_username === 'string' ? idToken.preferred_username : undefined,
  };

  writeStoredJson(authStorageKey, token);
  removeStored(pendingStorageKey);
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  return token;
}
