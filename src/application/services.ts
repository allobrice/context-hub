import type { Clock } from './ports/Clock.ts'
import type { ContextRepository } from './ports/ContextRepository.ts'
import type { WorkspaceRepository } from './ports/WorkspaceRepository.ts'

/** Dépendances injectées dans l'UI par le point d'assemblage (src/main.tsx). */
export interface AppServices {
  readonly contexts: ContextRepository
  readonly workspace: WorkspaceRepository
  readonly clock: Clock
}
