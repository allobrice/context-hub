import type { CollectionDeletionRequest } from '../../domain/taxonomy/collections.ts'
import type { MergeImpact } from '../../domain/taxonomy/tags.ts'
import type { Collection, Tag } from '../../domain/taxonomy/types.ts'

export interface NewCollection {
  readonly name: string
  readonly description: string
}

/**
 * Taxonomie (SPEC §5.4). Renommer, fusionner ou supprimer met à jour tous les contextes
 * concernés, sans créer de version : les URI ne changent pas.
 */
export interface TaxonomyRepository {
  /** Tags avec compteurs (contextes, publiés) et dernier usage. */
  listTags(): Promise<readonly Tag[]>
  listCollections(): Promise<readonly Collection[]>
  createCollection(input: NewCollection): Promise<Collection>

  /** Impact chiffré d'une fusion, calculé par le serveur (dialog de fusion). */
  previewTagMerge(sources: readonly string[], target: string): Promise<MergeImpact>
  /**
   * Renomme un tag. Vers un nom existant, c'est une fusion (SPEC §2).
   * @throws TaxonomyRuleError (nom invalide, tag inconnu)
   */
  renameTag(from: string, to: string): Promise<void>
  /** Fusionne `sources` dans `target` (créé s'il n'existe pas). */
  mergeTags(sources: readonly string[], target: string): Promise<void>
  /** Retire les tags de tous les contextes et du registre. */
  deleteTags(names: readonly string[]): Promise<void>

  /** @throws TaxonomyRuleError si la collection est la collection système. */
  updateCollection(id: string, input: NewCollection): Promise<Collection>
  /** Supprime une collection en déplaçant ses contextes vers la cible (obligatoire). */
  deleteCollection(request: CollectionDeletionRequest): Promise<void>
}
