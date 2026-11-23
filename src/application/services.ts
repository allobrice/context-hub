import type { Clock } from './ports/Clock.ts'
import type { ContextRepository } from './ports/ContextRepository.ts'
import type { WorkspaceRepository } from './ports/WorkspaceRepository.ts'

/** Dépendances injectées dans l'UI par le point d'assemblage (src/main.tsx). */
export interface AppConfig {
  /** Hôte du serveur MCP (`VITE_MCP_HOST`), ou null : placeholder [HÔTE]. */
  readonly mcpHost: string | null
}

export interface AppServices {
  readonly contexts: ContextRepository
  readonly workspace: WorkspaceRepository
  readonly clock: Clock
  readonly config: AppConfig
}
