import type { ContextId } from '@context-hub/domain/context/types.ts'

/** Changement de la liste des contextes lisibles par MCP : publication, archivage, désarchivage. */
export interface ContextListChanged {
  readonly kind: 'published' | 'archived' | 'unarchived'
  readonly contextId: ContextId
}

export type ContextEventListener = (event: ContextListChanged) => void

/** Bus d'évènements des contextes, consommé par le serveur MCP (`notifications/resources/list_changed`). */
export interface ContextEvents {
  emit(event: ContextListChanged): void
  /** @returns une fonction de désabonnement */
  subscribe(listener: ContextEventListener): () => void
}
