import type {
  NewCollection,
  TaxonomyRepository,
} from '../../application/ports/TaxonomyRepository.ts'
import { slugify } from '@context-hub/domain/context/slug.ts'
import { TaxonomyRuleError } from '@context-hub/domain/shared/errors.ts'
import {
  canRenameCollection,
  planCollectionDeletion,
  type CollectionDeletionRequest,
} from '@context-hub/domain/taxonomy/collections.ts'
import {
  applyTagMerge,
  isValidTagName,
  mergeImpact,
  normalizeTagName,
  planTagRename,
  type MergeImpact,
} from '@context-hub/domain/taxonomy/tags.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'
import type { Clock } from '../../application/ports/Clock.ts'
import type { InMemoryState } from './InMemoryStore.ts'
import { visibleState } from './InMemoryStore.ts'
import { toCollection } from './InMemoryWorkspaceRepository.ts'
import { simulateMutation, simulatePrimary, type SimulationOptions } from './simulation.ts'

export class InMemoryTaxonomyRepository implements TaxonomyRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
    private readonly clock: Clock,
  ) {}

  listTags(): Promise<readonly Tag[]> {
    return simulatePrimary(this.simulation, () => this.tagsWithCounts())
  }

  listCollections(): Promise<readonly Collection[]> {
    return simulatePrimary(this.simulation, () => {
      const { contexts, collections } = visibleState(this.state, this.simulation.mode())
      return collections.map((record) =>
        toCollection(
          record,
          contexts.map((r) => r.context),
        ),
      )
    })
  }

  createCollection({ name, description }: NewCollection): Promise<Collection> {
    return simulateMutation(this.simulation, () => {
      const base = slugify(name) || 'collection'
      let id = base
      for (let n = 2; this.state.collections.some((c) => c.id === id); n += 1) id = `${base}-${n}`
      const record = { id, name: name.trim(), description: description.trim() }
      // Avant la collection système, qui reste en dernier.
      const systemIndex = this.state.collections.findIndex((c) => c.system)
      this.state.collections.splice(
        systemIndex < 0 ? this.state.collections.length : systemIndex,
        0,
        record,
      )
      return { ...record, contextCount: 0, publishedCount: 0 }
    })
  }

  previewTagMerge(sources: readonly string[], target: string): Promise<MergeImpact> {
    return simulateMutation(this.simulation, () =>
      mergeImpact(
        this.state.contexts.map(({ context }) => context),
        sources,
        normalizeTagName(target),
      ),
    )
  }

  renameTag(from: string, to: string): Promise<void> {
    return simulateMutation(this.simulation, () => {
      this.assertKnownTags([from])
      const plan = planTagRename(this.tagsWithCounts(), from, to)
      switch (plan.kind) {
        case 'invalid':
          throw new TaxonomyRuleError('invalid-tag-name')
        case 'unchanged':
          return
        case 'merge':
          this.applyMerge([from], plan.into.name)
          return
        case 'rename':
          this.applyMerge([from], plan.to)
      }
    })
  }

  mergeTags(sources: readonly string[], target: string): Promise<void> {
    return simulateMutation(this.simulation, () => {
      this.assertKnownTags(sources)
      const name = normalizeTagName(target)
      if (!isValidTagName(name)) throw new TaxonomyRuleError('invalid-tag-name')
      this.applyMerge(sources, name)
    })
  }

  deleteTags(names: readonly string[]): Promise<void> {
    return simulateMutation(this.simulation, () => {
      this.assertKnownTags(names)
      const removed = new Set(names)
      this.state.contexts = this.state.contexts.map((record) => ({
        ...record,
        context: {
          ...record.context,
          tags: record.context.tags.filter((tag) => !removed.has(tag)),
        },
      }))
      this.state.tags = this.state.tags.filter((tag) => !removed.has(tag.name))
    })
  }

  updateCollection(id: string, { name, description }: NewCollection): Promise<Collection> {
    return simulateMutation(this.simulation, () => {
      const index = this.state.collections.findIndex((collection) => collection.id === id)
      const current = this.state.collections[index]
      if (!current) throw new TaxonomyRuleError('unknown-collection')
      if (!canRenameCollection(current)) throw new TaxonomyRuleError('system-collection-immutable')
      const next = { ...current, name: name.trim(), description: description.trim() }
      this.state.collections[index] = next
      return toCollection(
        next,
        this.state.contexts.map((r) => r.context),
      )
    })
  }

  deleteCollection(request: CollectionDeletionRequest): Promise<void> {
    return simulateMutation(this.simulation, () => {
      const contexts = this.state.contexts.map((r) => r.context)
      const collections = this.state.collections.map((record) => toCollection(record, contexts))
      const { deleted, target, tagToAdd } = planCollectionDeletion(collections, request)
      const targetId = target.id === UNCATEGORIZED_COLLECTION_ID ? null : target.id
      this.state.contexts = this.state.contexts.map((record) => {
        if (record.context.collectionId !== deleted.id) return record
        const tags =
          tagToAdd && !record.context.tags.includes(tagToAdd)
            ? [...record.context.tags, tagToAdd]
            : record.context.tags
        return { ...record, context: { ...record.context, collectionId: targetId, tags } }
      })
      if (tagToAdd) this.touchTag(tagToAdd)
      this.state.collections = this.state.collections.filter(
        (collection) => collection.id !== deleted.id,
      )
    })
  }

  private tagsWithCounts(): Tag[] {
    const { contexts, tags } = visibleState(this.state, this.simulation.mode())
    return tags.map(({ name, lastUsedAt }) => {
      const carriers = contexts.filter(({ context }) => context.tags.includes(name))
      return {
        name,
        lastUsedAt,
        contextCount: carriers.length,
        publishedCount: carriers.filter(({ context }) => context.status === 'published').length,
      }
    })
  }

  private assertKnownTags(names: readonly string[]): void {
    if (names.some((name) => !this.state.tags.some((tag) => tag.name === name))) {
      throw new TaxonomyRuleError('unknown-tag')
    }
  }

  /** Remplace les tags `sources` par `target` dans tous les contextes, sans créer de version. */
  private applyMerge(sources: readonly string[], target: string): void {
    const removed = new Set(sources.filter((source) => source !== target))
    this.state.contexts = this.state.contexts.map((record) => {
      if (!record.context.tags.some((tag) => removed.has(tag))) return record
      return {
        ...record,
        context: { ...record.context, tags: applyTagMerge(record.context.tags, sources, target) },
      }
    })
    this.state.tags = this.state.tags.filter((tag) => !removed.has(tag.name))
    this.touchTag(target)
  }

  private touchTag(name: string): void {
    const now = this.clock.now().toISOString()
    const index = this.state.tags.findIndex((tag) => tag.name === name)
    if (index < 0) this.state.tags.push({ name, lastUsedAt: now })
    else this.state.tags[index] = { name, lastUsedAt: now }
  }
}
