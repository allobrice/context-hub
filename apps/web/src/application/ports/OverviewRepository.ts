import type { ScopeKind } from '@context-hub/domain/context/types.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'

export type McpServerStatus = 'online' | 'offline'

/** Données de navigation (sidebar) : légères, indépendantes de l'écran affiché. */
export interface WorkspaceOverview {
  readonly workspaceName: string
  readonly currentUser: { readonly name: string }
  readonly contextCount: number
  /** Collections avec leurs compteurs, système (« Sans collection ») comprise. */
  readonly collections: readonly Collection[]
  readonly scopeCounts: Readonly<Record<ScopeKind, number>>
  readonly tagNames: readonly string[]
  readonly mcpServer: { readonly status: McpServerStatus; readonly transport: string }
  /** Workspaces ouverts (Inactifs compris) dont l'utilisateur est membre. */
  readonly openWorkspaceCount: number
}

export interface OverviewRepository {
  getOverview(): Promise<WorkspaceOverview>
}
