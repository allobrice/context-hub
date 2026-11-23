import { TaxonomyRuleError } from '@context-hub/domain/shared/errors.ts'
import type { CollectionDeletionRequest } from '@context-hub/domain/taxonomy/collections.ts'
import type { MergeImpact } from '@context-hub/domain/taxonomy/tags.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'

import type {
  NewCollection,
  TaxonomyRepository,
} from '../../application/ports/TaxonomyRepository.ts'
import { unwrap, unwrapEmpty, type ApiClient } from './apiClient.ts'
import { toCollection } from './mappers.ts'

export class HttpTaxonomyRepository implements TaxonomyRepository {
  constructor(private readonly api: ApiClient) {}

  async listTags(): Promise<readonly Tag[]> {
    return unwrap(this.api.GET('/api/tags'))
  }

  async listCollections(): Promise<readonly Collection[]> {
    return (await unwrap(this.api.GET('/api/collections'))).map(toCollection)
  }

  async createCollection(input: NewCollection): Promise<Collection> {
    return toCollection(await unwrap(this.api.POST('/api/collections', { body: input })))
  }

  previewTagMerge(sources: readonly string[], target: string): Promise<MergeImpact> {
    return unwrap(
      this.api.POST('/api/tags/merge/preview', { body: { sources: [...sources], target } }),
    )
  }

  renameTag(from: string, to: string): Promise<void> {
    const params = { path: { name: from } }
    return unwrapEmpty(this.api.PATCH('/api/tags/{name}', { params, body: { name: to } }))
  }

  mergeTags(sources: readonly string[], target: string): Promise<void> {
    return unwrapEmpty(
      this.api.POST('/api/tags/merge', { body: { sources: [...sources], target } }),
    )
  }

  /** Un appel par tag (DELETE /api/tags/{name}), dans l'ordre. */
  async deleteTags(names: readonly string[]): Promise<void> {
    for (const name of names) {
      await unwrapEmpty(this.api.DELETE('/api/tags/{name}', { params: { path: { name } } }))
    }
  }

  async updateCollection(id: string, input: NewCollection): Promise<Collection> {
    const params = { path: { id } }
    return toCollection(
      await unwrap(this.api.PATCH('/api/collections/{id}', { params, body: input })),
    )
  }

  deleteCollection({
    deletedId,
    targetId,
    addFormerNameAsTag,
  }: CollectionDeletionRequest): Promise<void> {
    // Même règle que le domaine : la cible est obligatoire (le serveur répondrait 400).
    if (targetId === null) return Promise.reject(new TaxonomyRuleError('deletion-target-required'))
    const params = {
      path: { id: deletedId },
      query: {
        targetCollectionId: targetId,
        addFormerNameAsTag: addFormerNameAsTag ? 'true' : 'false',
      },
    } as const
    return unwrapEmpty(this.api.DELETE('/api/collections/{id}', { params }))
  }
}
