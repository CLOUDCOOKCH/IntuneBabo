export interface SharedGraphRegistration {
  clientId: string;
  tenantId: string;
  appName: string;
}

function readEnv(value: string | undefined): string {
  return value?.trim() ?? '';
}

const clientId = readEnv(import.meta.env.VITE_GRAPH_SHARED_CLIENT_ID);
const tenantId = readEnv(import.meta.env.VITE_GRAPH_SHARED_TENANT_ID) || 'organizations';
const appName = readEnv(import.meta.env.VITE_GRAPH_SHARED_APP_NAME) || 'IntuneCooker shared app registration';

export const sharedGraphRegistration: SharedGraphRegistration | null = clientId
  ? {
      clientId,
      tenantId,
      appName,
    }
  : null;
