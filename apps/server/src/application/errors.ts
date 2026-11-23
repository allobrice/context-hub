import type { ContextId } from '@context-hub/domain/context/types.ts'

/** Publication demandée alors qu'aucun brouillon n'est en cours : rien à publier. */
export class NoDraftError extends Error {
  readonly code = 'NO_DRAFT'
  constructor(readonly contextId: ContextId) {
    super(`Aucun brouillon à publier pour ${contextId}`)
    this.name = 'NoDraftError'
  }
}
