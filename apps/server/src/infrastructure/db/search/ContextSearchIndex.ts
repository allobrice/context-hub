import type { SyncDb } from '../connection.ts'

/**
 * Ce qui est indexé pour un contexte, en deux textes séparés :
 * - `currentText` : métadonnées courantes et contenus (publié et brouillon), pour l'UI ;
 * - `publishedText` : métadonnées et contenu PUBLIÉS seulement (null si jamais publié), pour MCP.
 */
export interface SearchDocument {
  readonly contextId: string
  readonly currentText: string
  readonly publishedText: string | null
}

/**
 * - `library` : Bibliothèque de l'UI, sur le texte courant et publié ;
 * - `published` : MCP, sur le seul texte publié : aucun terme de brouillon (contenu, titre,
 *   description, tags) ne peut remonter.
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
  /** Vrai si l'index ne contient aucun document (à reconstruire après une migration). */
  isEmpty(db: SyncDb): boolean
}
