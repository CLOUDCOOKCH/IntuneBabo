/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPH_SHARED_CLIENT_ID?: string;
  readonly VITE_GRAPH_SHARED_TENANT_ID?: string;
  readonly VITE_GRAPH_SHARED_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.png?inline' {
  const src: string;
  export default src;
}
