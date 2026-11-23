import { TaxonomyRuleError } from '../shared/errors.ts'
import { slugify } from '../context/slug.ts'
import type { Collection } from './types.ts'

export function isSystemCollection(collection: Pick<Collection, 'system'>): boolean {
  return collection.system === true
}

/** « Sans collection » n'est ni renommable ni supprimable. */
export function canRenameCollection(collection: Pick<Collection, 'system'>): boolean {
  return !isSystemCollection(collection)
}

export function canDeleteCollection(collection: Pick<Collection, 'system'>): boolean {
  return !isSystemCollection(collection)
}

/** Cibles possibles pour reclasser les contextes d'une collection supprimée (la système comprise). */
export function deletionTargets(
  collections: readonly Collection[],
  deletedId: string,
): Collection[] {
  return collections.filter((collection) => collection.id !== deletedId)
}

export interface CollectionDeletion {
  readonly deleted: Collection
  readonly target: Collection
  /** Tag ajouté aux contextes reclassés, ou null si l'option est décochée. */
  readonly tagToAdd: string | null
}

export interface CollectionDeletionRequest {
  readonly deletedId: string
  readonly targetId: string | null
  readonly addFormerNameAsTag: boolean
}

/**
 * Valide une suppression de collection : collection cible obligatoire, différente
 * de la supprimée ; la collection système ne peut pas être supprimée.
 * @throws TaxonomyRuleError
 */
export function planCollectionDeletion(
  collections: readonly Collection[],
  request: CollectionDeletionRequest,
): CollectionDeletion {
  const deleted = collections.find((collection) => collection.id === request.deletedId)
  if (!deleted) throw new TaxonomyRuleError('unknown-collection')
  if (!canDeleteCollection(deleted)) throw new TaxonomyRuleError('system-collection-immutable')
  if (request.targetId === null) throw new TaxonomyRuleError('deletion-target-required')
  const target = deletionTargets(collections, deleted.id).find(
    (collection) => collection.id === request.targetId,
  )
  if (!target) throw new TaxonomyRuleError('deletion-target-invalid')
  return { deleted, target, tagToAdd: request.addFormerNameAsTag ? slugify(deleted.name) : null }
}
