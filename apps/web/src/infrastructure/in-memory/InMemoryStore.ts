import {
  COLLECTION_FIXTURES,
  type CollectionRecord,
} from '@context-hub/domain/fixtures/collections.ts'
import { CONTEXT_FIXTURES, type ContextRecord } from '@context-hub/domain/fixtures/contexts.ts'
import { TAG_FIXTURES, type TagRecord } from '@context-hub/domain/fixtures/tags.ts'
import {
  WORKSPACE_FIXTURES,
  type WorkspaceMemberFixture,
} from '@context-hub/domain/fixtures/workspaces.ts'
import type {
  Claim,
  Participant,
  Workspace,
  WorkspaceEntry,
} from '@context-hub/domain/workspaces/types.ts'
import type { MockMode } from './mockMode.ts'

/** État en mémoire partagé par les repositories (perdu au rechargement, voir CLAUDE.md). */
export interface InMemoryState {
  contexts: ContextRecord[]
  collections: CollectionRecord[]
  tags: TagRecord[]
  workspaces: WorkspaceRecord[]
}

/** Un workspace et tout ce qui en dépend, mutable par le repository in-memory. */
export interface WorkspaceRecord {
  workspace: Workspace
  closedBy: string | null
  members: WorkspaceMemberFixture[]
  participants: Participant[]
  claims: Claim[]
  entries: WorkspaceEntry[]
}

export function createDemoState(): InMemoryState {
  return {
    contexts: [...CONTEXT_FIXTURES],
    collections: [...COLLECTION_FIXTURES],
    tags: [...TAG_FIXTURES],
    workspaces: WORKSPACE_FIXTURES.map((fixture) => ({
      workspace: fixture.workspace,
      closedBy: fixture.workspace.closedAt === null ? null : fixture.workspace.createdBy,
      members: [...fixture.members],
      participants: [...fixture.participants],
      claims: [...fixture.claims],
      entries: [...fixture.entries],
    })),
  }
}

/** Vue de l'état selon le mode : `empty` présente un espace sans aucune donnée (maquettes 04 et 20). */
export function visibleState(state: InMemoryState, mode: MockMode): InMemoryState {
  return mode === 'empty' ? { contexts: [], collections: [], tags: [], workspaces: [] } : state
}
