import type { Context, ContextId, ContextVersion } from '../../domain/context/types.ts'
import type { LibraryCriteria, Page, StatusCounts } from '../../domain/library/criteria.ts'

export interface LibrarySearchResult {
  readonly page: Page<Context>
  /** Compteurs de toute la bibliothèque, indépendants des filtres (en-tête). */
  readonly totals: StatusCounts
}

export interface ContextDetail {
  readonly context: Context
  /** Versions publiées, de la plus récente à la plus ancienne. */
  readonly history: readonly ContextVersion[]
  /** Nom de la collection, ou null pour « Sans collection ». */
  readonly collectionName: string | null
}

export interface ContextRepository {
  /** Recherche, filtres, tri et pagination côté stockage (comme le fera l'API). */
  search(criteria: LibraryCriteria): Promise<LibrarySearchResult>
  /**
   * Un contexte par identifiant ou par slug.
   * @throws ContextNotFoundError si aucun contexte ne correspond (ou hors de portée).
   */
  get(reference: string): Promise<ContextDetail>
  /** Les sessions MCP ne lisent plus le contexte. */
  archive(id: ContextId): Promise<ContextDetail>
  unarchive(id: ContextId): Promise<ContextDetail>
  /** Copie la version `versionNumber` dans le brouillon, sans publier. */
  restoreVersion(id: ContextId, versionNumber: number): Promise<ContextDetail>
}
