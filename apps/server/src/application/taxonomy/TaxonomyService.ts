import { TaxonomyRuleError } from '@context-hub/domain/shared/errors.ts'
import {
  canRenameCollection,
  planCollectionDeletion,
  type CollectionDeletionRequest,
} from '@context-hub/domain/taxonomy/collections.ts'
import {
  isValidTagName,
  mergeImpact,
  normalizeTagName,
  planTagRename,
  type MergeImpact,
} from '@context-hub/domain/taxonomy/tags.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import type { Clock } from '../ports/Clock.ts'
import type { CollectionInput, TaxonomyStore } from '../ports/TaxonomyStore.ts'
import type { Viewer } from '../viewer.ts'

/**
 * Cas d'usage de la taxonomie (SPEC §5.4). Renommer vers un nom existant = fusionner ;
 * « Sans collection » est protégée ; supprimer une collection impose une cible.
 */
export class TaxonomyService {
  constructor(
    private readonly store: TaxonomyStore,
    private readonly clock: Clock,
  ) {}

  listTags(viewer: Viewer): Promise<readonly Tag[]> {
    return this.store.listTags(viewer)
  }

  /** Impact chiffré d'une fusion, sur tous les contextes (une fusion les modifie tous). */
  async previewTagMerge(sources: readonly string[], target: string): Promise<MergeImpact> {
    return mergeImpact(await this.store.tagAssignments(), sources, normalizeTagName(target))
  }

  /** @throws TaxonomyRuleError (tag inconnu, nom invalide) */
  async renameTag(viewer: Viewer, from: string, to: string): Promise<void> {
    await this.assertKnownTags([from])
    const plan = planTagRename(await this.store.listTags(viewer), from, to)
    switch (plan.kind) {
      case 'invalid':
        throw new TaxonomyRuleError('invalid-tag-name')
      case 'unchanged':
        return
      case 'merge':
        return this.store.replaceTags({ sources: [from], target: plan.into.name, at: this.now() })
      case 'rename':
        return this.store.replaceTags({ sources: [from], target: plan.to, at: this.now() })
    }
  }

  /** Fusionne `sources` dans `target` (créé s'il n'existe pas). @throws TaxonomyRuleError */
  async mergeTags(sources: readonly string[], target: string): Promise<void> {
    await this.assertKnownTags(sources)
    const name = normalizeTagName(target)
    if (!isValidTagName(name)) throw new TaxonomyRuleError('invalid-tag-name')
    await this.store.replaceTags({ sources, target: name, at: this.now() })
  }

  /** @throws TaxonomyRuleError si le tag est inconnu */
  async deleteTag(name: string): Promise<void> {
    await this.assertKnownTags([name])
    await this.store.deleteTags([name])
  }

  listCollections(viewer: Viewer): Promise<readonly Collection[]> {
    return this.store.listCollections(viewer)
  }

  createCollection(input: CollectionInput): Promise<Collection> {
    return this.store.createCollection(input)
  }

  /** @throws TaxonomyRuleError (collection inconnue ou système) */
  async updateCollection(viewer: Viewer, id: string, input: CollectionInput): Promise<Collection> {
    const current = await this.findCollection(viewer, id)
    if (!canRenameCollection(current)) throw new TaxonomyRuleError('system-collection-immutable')
    await this.store.updateCollection(id, input)
    return this.findCollection(viewer, id)
  }

  /** Déplace les contextes vers la cible (obligatoire), puis supprime. @throws TaxonomyRuleError */
  async deleteCollection(viewer: Viewer, request: CollectionDeletionRequest): Promise<void> {
    const { deleted, target, tagToAdd } = planCollectionDeletion(
      await this.store.listCollections(viewer),
      request,
    )
    await this.store.deleteCollection({
      deletedId: deleted.id,
      targetId: target.id === UNCATEGORIZED_COLLECTION_ID ? null : target.id,
      tagToAdd,
      at: this.now(),
    })
  }

  private async findCollection(viewer: Viewer, id: string): Promise<Collection> {
    const collection = (await this.store.listCollections(viewer)).find((c) => c.id === id)
    if (!collection) throw new TaxonomyRuleError('unknown-collection')
    return collection
  }

  private async assertKnownTags(names: readonly string[]): Promise<void> {
    if ((await this.store.unknownTags(names)).length > 0) {
      throw new TaxonomyRuleError('unknown-tag')
    }
  }

  private now(): Date {
    return this.clock.now()
  }
}
