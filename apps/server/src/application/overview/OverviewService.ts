import type { ScopeKind } from '@context-hub/domain/context/types.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'

import type { ContextStore } from '../ports/ContextStore.ts'
import type { MissionService } from '../missions/MissionService.ts'
import type { WorkspaceService } from '../workspaces/WorkspaceService.ts'
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
  /** Workspaces ouverts dont l'utilisateur est membre (compteur « Workspaces » de la sidebar). */
  readonly openWorkspaceCount: number
  /** Missions à traiter (compteur « Missions » de la sidebar). */
  readonly missionTodoCount: number
}

/** Données de navigation (sidebar), calculées pour l'utilisateur authentifié. */
export class OverviewService {
  constructor(
    private readonly contexts: ContextStore,
    private readonly taxonomy: TaxonomyStore,
    private readonly workspaceName: string,
    private readonly workspaces: WorkspaceService,
    private readonly missions: MissionService,
  ) {}

  async overview(user: User): Promise<WorkspaceOverview> {
    const viewer = { userId: user.id }
    const [scopeCounts, collections, tags, workspaces, missionTodoCount] = await Promise.all([
      this.contexts.countByScope(viewer),
      this.taxonomy.listCollections(viewer),
      this.taxonomy.listTags(viewer),
      this.workspaces.list(viewer, 'open'),
      this.missions.todoCount(viewer),
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
      openWorkspaceCount: workspaces.counts.open,
      missionTodoCount,
    }
  }
}
