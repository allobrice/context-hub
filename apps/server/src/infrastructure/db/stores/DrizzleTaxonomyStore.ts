import { and, asc, count, eq, inArray, max, sql } from 'drizzle-orm'

import { slugify } from '@context-hub/domain/context/slug.ts'
import { applyTagMerge } from '@context-hub/domain/taxonomy/tags.ts'
import type { Collection, Tag } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import type {
  CollectionInput,
  CollectionRemoval,
  TagAssignment,
  TagReplacement,
  TaxonomyStore,
} from '../../../application/ports/TaxonomyStore.ts'
import type { Viewer } from '../../../application/viewer.ts'
import type { AppDatabase, SyncDb } from '../connection.ts'
import { deferred } from '../deferred.ts'
import { isoDate } from '../dates.ts'
import { collections, contexts, contextTags, tags } from '../schema.ts'
import type { ContextSearchIndex } from '../search/ContextSearchIndex.ts'
import { reindex, tagsByContext, visibleTo, writeTags } from './contextRecords.ts'

/** Nombre de contextes publiés, en SQL standard (portable). */
const publishedCount = sql<number>`sum(case when ${contexts.status} = 'published' then 1 else 0 end)`

type CollectionRow = typeof collections.$inferSelect

function toCollection(
  row: CollectionRow,
  counts: ReadonlyMap<string, { contextCount: number; publishedCount: number }>,
): Collection {
  const { contextCount, publishedCount: published } = counts.get(row.id) ?? {
    contextCount: 0,
    publishedCount: 0,
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    contextCount,
    publishedCount: published,
    ...(row.system ? { system: true as const } : {}),
  }
}

/** Contextes portant au moins un des tags `names`. */
function carriersOf(db: SyncDb, names: readonly string[]): string[] {
  if (names.length === 0) return []
  return db
    .selectDistinct({ contextId: contextTags.contextId })
    .from(contextTags)
    .where(inArray(contextTags.tagName, [...names]))
    .all()
    .map((row) => row.contextId)
}

function touchTag(db: SyncDb, name: string, at: Date): void {
  const lastUsedAt = isoDate(at)
  db.insert(tags)
    .values({ name, lastUsedAt })
    .onConflictDoUpdate({ target: tags.name, set: { lastUsedAt } })
    .run()
}

/** Taxonomie sur SQLite (Drizzle). Chaque mutation réindexe les contextes touchés (tags indexés). */
export class DrizzleTaxonomyStore implements TaxonomyStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly searchIndex: ContextSearchIndex,
  ) {}

  listTags(viewer: Viewer): Promise<readonly Tag[]> {
    return deferred(() => {
      const counts = this.db
        .select({ name: contextTags.tagName, contextCount: count(), publishedCount })
        .from(contextTags)
        .innerJoin(contexts, eq(contexts.id, contextTags.contextId))
        .where(visibleTo(viewer))
        .groupBy(contextTags.tagName)
        .all()
      const byName = new Map(counts.map((row) => [row.name, row]))
      return this.db
        .select()
        .from(tags)
        .orderBy(asc(tags.name))
        .all()
        .map((row) => ({
          name: row.name,
          lastUsedAt: row.lastUsedAt,
          contextCount: byName.get(row.name)?.contextCount ?? 0,
          publishedCount: byName.get(row.name)?.publishedCount ?? 0,
        }))
    })
  }

  unknownTags(names: readonly string[]): Promise<readonly string[]> {
    return deferred(() => {
      if (names.length === 0) return []
      const known = new Set(
        this.db
          .select({ name: tags.name })
          .from(tags)
          .where(inArray(tags.name, [...names]))
          .all()
          .map((row) => row.name),
      )
      return names.filter((name) => !known.has(name))
    })
  }

  tagAssignments(): Promise<readonly TagAssignment[]> {
    return deferred(() => {
      const rows = this.db.select({ id: contexts.id, status: contexts.status }).from(contexts).all()
      const tagLists = tagsByContext(
        this.db,
        rows.map((row) => row.id),
      )
      return rows.map((row) => ({ status: row.status, tags: tagLists.get(row.id) ?? [] }))
    })
  }

  replaceTags({ sources, target, at }: TagReplacement): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        const removed = sources.filter((source) => source !== target)
        touchTag(tx, target, at)
        const affected = carriersOf(tx, removed)
        const tagLists = tagsByContext(tx, affected)
        for (const contextId of affected) {
          const merged = applyTagMerge(tagLists.get(contextId) ?? [], sources, target)
          writeTags(tx, contextId, merged, at)
        }
        if (removed.length > 0) tx.delete(tags).where(inArray(tags.name, removed)).run()
        for (const contextId of affected) reindex(tx, this.searchIndex, contextId)
      })
    })
  }

  deleteTags(names: readonly string[]): Promise<void> {
    return deferred(() => {
      if (names.length === 0) return
      this.db.transaction((tx) => {
        const affected = carriersOf(tx, names)
        tx.delete(contextTags)
          .where(inArray(contextTags.tagName, [...names]))
          .run()
        tx.delete(tags)
          .where(inArray(tags.name, [...names]))
          .run()
        for (const contextId of affected) reindex(tx, this.searchIndex, contextId)
      })
    })
  }

  listCollections(viewer: Viewer): Promise<readonly Collection[]> {
    return deferred(() => {
      const collectionKey = sql<string>`coalesce(${contexts.collectionId}, ${UNCATEGORIZED_COLLECTION_ID})`
      const counts = this.db
        .select({ id: collectionKey, contextCount: count(), publishedCount })
        .from(contexts)
        .where(visibleTo(viewer))
        .groupBy(collectionKey)
        .all()
      const byId = new Map(
        counts.map((row) => [
          row.id,
          { contextCount: row.contextCount, publishedCount: row.publishedCount },
        ]),
      )
      return this.db
        .select()
        .from(collections)
        .orderBy(asc(collections.system), asc(collections.position))
        .all()
        .map((row) => toCollection(row, byId))
    })
  }

  createCollection({ name, description }: CollectionInput): Promise<Collection> {
    return deferred(() =>
      this.db.transaction((tx) => {
        const base = slugify(name) || 'collection'
        let id = base
        for (let n = 2; this.collectionExists(tx, id); n += 1) id = `${base}-${n}`
        const last = tx
          .select({ position: max(collections.position) })
          .from(collections)
          .get()
        const row = {
          id,
          name: name.trim(),
          description: description.trim(),
          system: false,
          position: (last?.position ?? 0) + 1,
        }
        tx.insert(collections).values(row).run()
        return toCollection(row, new Map())
      }),
    )
  }

  updateCollection(id: string, { name, description }: CollectionInput): Promise<boolean> {
    return deferred(() => {
      const result = this.db
        .update(collections)
        .set({ name: name.trim(), description: description.trim() })
        .where(and(eq(collections.id, id), eq(collections.system, false)))
        .run()
      return result.changes > 0
    })
  }

  deleteCollection({ deletedId, targetId, tagToAdd, at }: CollectionRemoval): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        const moved = tx
          .select({ id: contexts.id })
          .from(contexts)
          .where(eq(contexts.collectionId, deletedId))
          .all()
          .map((row) => row.id)
        tx.update(contexts)
          .set({ collectionId: targetId })
          .where(eq(contexts.collectionId, deletedId))
          .run()
        if (tagToAdd !== null) {
          touchTag(tx, tagToAdd, at)
          const tagLists = tagsByContext(tx, moved)
          for (const contextId of moved) {
            const current = tagLists.get(contextId) ?? []
            if (!current.includes(tagToAdd)) writeTags(tx, contextId, [...current, tagToAdd], at)
          }
        }
        tx.delete(collections).where(eq(collections.id, deletedId)).run()
        for (const contextId of moved) reindex(tx, this.searchIndex, contextId)
      })
    })
  }

  private collectionExists(db: SyncDb, id: string): boolean {
    return (
      db.select({ id: collections.id }).from(collections).where(eq(collections.id, id)).get() !==
      undefined
    )
  }
}
