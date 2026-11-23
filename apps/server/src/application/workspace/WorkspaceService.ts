import type { ScopeKind } from '@context-hub/domain/context/types.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'

import type { ContextStore } from '../ports/ContextStore.ts'
import type { TaxonomyStore } from '../ports/TaxonomyStore.ts'
import type { User } from '../viewer.ts'

export interface WorkspaceOverview {
  readonly workspaceName: string
  readonly currentUser: { readonly name: string }
  readonly contextCount: number
  readonly collections: readonly Collection[]
  readonly scopeCounts: Readonly<Record<ScopeKind, number>>
  readonly tagNames: readonly string[]
  readonly mcpServer: { readonly status: 'online' | 'offline'; readonly transport: string }
}

/** Données de navigation (sidebar), calculées pour l'utilisateur authentifié. */
export class WorkspaceService {
  constructor(
    private readonly contexts: ContextStore,
    private readonly taxonomy: TaxonomyStore,
    private readonly workspaceName: string,
  ) {}

  async overview(user: User): Promise<WorkspaceOverview> {
    const viewer = { userId: user.id }
    const [scopeCounts, collections, tags] = await Promise.all([
      this.contexts.countByScope(viewer),
      this.taxonomy.listCollections(viewer),
      this.taxonomy.listTags(viewer),
    ])
    return {
      workspaceName: this.workspaceName,
      currentUser: { name: user.name },
      contextCount: scopeCounts.personal + scopeCounts.project + scopeCounts.team,
      collections,
      scopeCounts,
      tagNames: tags.map((tag) => tag.name).sort((a, b) => a.localeCompare(b, 'fr')),
      // Ce serveur sert lui-même /mcp : s'il répond, le serveur MCP est en ligne.
      mcpServer: { status: 'online', transport: 'HTTP' },
    }
  }
}
