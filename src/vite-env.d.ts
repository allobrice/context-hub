/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Hôte du serveur MCP, sans protocole. Absent : placeholder [HÔTE]. */
  readonly VITE_MCP_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
