import {
  COLLECTION_FIXTURES,
  type CollectionRecord,
} from '@context-hub/domain/fixtures/collections.ts'
import { CONTEXT_FIXTURES, type ContextRecord } from '@context-hub/domain/fixtures/contexts.ts'
import { TAG_FIXTURES, type TagRecord } from '@context-hub/domain/fixtures/tags.ts'
import type { MockMode } from './mockMode.ts'

/** État en mémoire partagé par les repositories (perdu au rechargement, voir CLAUDE.md). */
export interface InMemoryState {
  contexts: ContextRecord[]
  collections: CollectionRecord[]
  tags: TagRecord[]
}

export function createDemoState(): InMemoryState {
  return {
    contexts: [...CONTEXT_FIXTURES],
    collections: [...COLLECTION_FIXTURES],
    tags: [...TAG_FIXTURES],
  }
}

/** Vue de l'état selon le mode : `empty` présente un espace sans aucune donnée (maquettes 04 et 20). */
export function visibleState(state: InMemoryState, mode: MockMode): InMemoryState {
  return mode === 'empty' ? { contexts: [], collections: [], tags: [] } : state
}
