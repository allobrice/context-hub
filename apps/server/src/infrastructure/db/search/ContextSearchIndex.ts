import type { SyncDb } from '../connection.ts'

/** Ce qui est indexé pour un contexte. Les contenus publié et brouillon sont séparés. */
export interface SearchDocument {
  readonly contextId: string
  readonly title: string
  readonly description: string
  readonly slug: string
  readonly tags: readonly string[]
  readonly publishedContent: string | null
  readonly draftContent: string | null
}

/**
 * - `library` : Bibliothèque de l'UI, sur tout (métadonnées, contenu publié et brouillon) ;
 * - `published` : MCP, sans le brouillon, pour qu'aucun terme non publié ne fuie.
 */
export type SearchScope = 'library' | 'published'

/**
 * Recherche plein texte, isolée derrière cette interface : c'est le seul endroit où vit du SQL propre
 * au moteur (FTS5 pour SQLite ; tsvector + GIN pour un futur Postgres). Les méthodes reçoivent la base
 * ou la transaction en cours, pour que l'index soit mis à jour dans la même transaction que les données.
 */
export interface ContextSearchIndex {
  upsert(db: SyncDb, document: SearchDocument): void
  /** Identifiants des contextes correspondants, du plus pertinent au moins pertinent. */
  match(db: SyncDb, query: string, scope: SearchScope): string[]
}
