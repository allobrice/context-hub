import type { Clock } from './ports/Clock.ts'
import type { ContextRepository } from './ports/ContextRepository.ts'
import type { DraftStorage } from './ports/DraftStorage.ts'
import type { MissionRepository } from './ports/MissionRepository.ts'
import type { TaxonomyRepository } from './ports/TaxonomyRepository.ts'
import type { OverviewRepository } from './ports/OverviewRepository.ts'
import type { WorkspaceRepository } from './ports/WorkspaceRepository.ts'

/** Dépendances injectées dans l'UI par le point d'assemblage (src/main.tsx). */
export interface AppConfig {
  /** URL du serveur MCP (`VITE_MCP_URL`), ou null : placeholder `https://[HÔTE]/mcp`. */
  readonly mcpUrl: string | null
  /** Intervalle du polling du journal d'un workspace (défaut 3 s ; plus court en test). */
  readonly workspacePollMs?: number
}

export interface AppServices {
  readonly contexts: ContextRepository
  readonly overview: OverviewRepository
  readonly workspaces: WorkspaceRepository
  readonly missions: MissionRepository
  readonly taxonomy: TaxonomyRepository
  readonly drafts: DraftStorage
  readonly clock: Clock
  readonly config: AppConfig
}
