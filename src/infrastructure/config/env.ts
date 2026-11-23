import type { AppConfig } from '../../application/services.ts'

/** Lecture centralisée de la configuration Vite. Le jeton MCP n'est jamais lu ici. */
export function readAppConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  const host = env.VITE_MCP_HOST?.trim() ?? ''
  return { mcpHost: host === '' ? null : host }
}
