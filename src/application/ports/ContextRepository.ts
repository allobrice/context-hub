import type { Context } from '../../domain/context/types.ts'
import type { LibraryCriteria, Page, StatusCounts } from '../../domain/library/criteria.ts'

export interface LibrarySearchResult {
  readonly page: Page<Context>
  /** Compteurs de toute la bibliothèque, indépendants des filtres (en-tête). */
  readonly totals: StatusCounts
}

export interface ContextRepository {
  /** Recherche, filtres, tri et pagination côté stockage (comme le fera l'API). */
  search(criteria: LibraryCriteria): Promise<LibrarySearchResult>
}
