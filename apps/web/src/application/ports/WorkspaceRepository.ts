import type {
  AuthoredEntryKind,
  EntryPage,
  WorkspaceDetail,
  WorkspaceEntry,
  WorkspaceList,
  WorkspaceStatus,
} from '@context-hub/domain/workspaces/types.ts'

/** Filtre de la liste (dans l'URL : `?status=open|closed|all`). */
export type WorkspaceListFilter = WorkspaceStatus | 'all'

export interface CreateWorkspaceCommand {
  readonly title: string
  readonly slug: string
  readonly goal: string
  readonly repos: readonly string[]
  readonly linkedContextIds: readonly string[]
}

/** Lecture du journal : vers l'avant depuis `since` (polling), ou vers le passé avant `before`. */
export type EntryQuery =
  | { readonly since: number; readonly limit: number }
  | { readonly before: number; readonly limit: number }

/**
 * Workspaces (SPEC §7). Erreurs : `WorkspaceNotFoundError`, `WorkspaceForbiddenError` (non membre),
 * `WorkspaceClosedError` (écriture dans un workspace fermé), `WorkspaceRuleError`.
 */
export interface WorkspaceRepository {
  list(filter: WorkspaceListFilter): Promise<WorkspaceList>
  get(slug: string): Promise<WorkspaceDetail>
  create(command: CreateWorkspaceCommand): Promise<WorkspaceDetail>
  close(slug: string): Promise<WorkspaceDetail>
  readEntries(slug: string, query: EntryQuery): Promise<EntryPage>
  /** Entrée humaine, publiée comme `<utilisateur> · ui` ; le serveur la scanne. */
  postEntry(
    slug: string,
    entry: { readonly kind: AuthoredEntryKind; readonly body: string },
  ): Promise<WorkspaceEntry>
  /** Libération forcée par un humain : une entrée système prévient la session détentrice. */
  forceReleaseClaim(slug: string, claimId: string): Promise<void>
}
