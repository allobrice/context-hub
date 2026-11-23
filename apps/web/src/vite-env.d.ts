/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Source des données : `memory` (défaut, fixtures et `?mock=*`) ou `http` (API Context Hub). */
  readonly VITE_DATA_SOURCE?: string
  /** Base de l'API en mode http ; vide = même origine (proxy Vite `/api` en dev). */
  readonly VITE_API_BASE_URL?: string
  /** URL du serveur MCP affichée dans « Utiliser dans Claude Code ». Absente : placeholder [HÔTE]. */
  readonly VITE_MCP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
