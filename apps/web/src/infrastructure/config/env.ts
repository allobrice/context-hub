import type { AppConfig } from '../../application/services.ts'

/** Lecture centralisée de la configuration Vite. Le jeton n'est jamais lu ici (proxy côté Node). */

/** Base de l'API : '' (même origine) par défaut. */
export function readApiBaseUrl(env: ImportMetaEnv = import.meta.env): string {
  return env.VITE_API_BASE_URL?.trim().replace(/\/+$/, '') ?? ''
}

function httpUrl(raw: string | undefined): string | null {
  const value = raw?.trim() ?? ''
  if (value === '') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function readAppConfig(env: ImportMetaEnv = import.meta.env): AppConfig {
  return { mcpUrl: httpUrl(env.VITE_MCP_URL) }
}
