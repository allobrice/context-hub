import { and, asc, count, desc, eq, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'

import {
  CONTEXT_STATUSES,
  SCOPE_KINDS,
  type ContextId,
  type ContextStatus,
  type ScopeKind,
} from '@context-hub/domain/context/types.ts'
import {
  pageWindow,
  queryTerms,
  toPage,
  type LibraryCriteria,
  type LibrarySort,
  type StatusCounts,
} from '@context-hub/domain/library/criteria.ts'
import { ContextNotFoundError, VersionConflictError } from '@context-hub/domain/shared/errors.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import type { Clock } from '../../../application/ports/Clock.ts'
import type {
  ContextDetail,
  ContextSearchResult,
  ContextStore,
  CreateContextCommand,
  PublishWrite,
  RestoreDraftWrite,
  RevisionWrite,
  SaveDraftWrite,
  StatusWrite,
} from '../../../application/ports/ContextStore.ts'
import type { Viewer } from '../../../application/viewer.ts'
import type { AppDatabase, SyncDb } from '../connection.ts'
import { deferred } from '../deferred.ts'
import { isoDate } from '../dates.ts'
import { collections, contextDrafts, contexts, contextTags, contextVersions } from '../schema.ts'
import type { ContextSearchIndex } from '../search/ContextSearchIndex.ts'
import {
  history,
  hydrate,
  metadataColumns,
  reindex,
  versionOf,
  visibleTo,
  writeTags,
} from './contextRecords.ts'

function orderOf(sort: LibrarySort): SQL[] {
  switch (sort) {
    case 'updated-desc':
      return [desc(contexts.updatedAt), asc(contexts.id)]
    case 'updated-asc':
      return [asc(contexts.updatedAt), asc(contexts.id)]
    case 'title-asc':
      return [asc(contexts.titleSortKey), asc(contexts.id)]
    case 'title-desc':
      return [desc(contexts.titleSortKey), asc(contexts.id)]
  }
}

/** Filtres de la Bibliothèque, hors recherche plein texte. */
function filterConditions(criteria: LibraryCriteria): SQL[] {
  const conditions: SQL[] = []
  if (criteria.status !== null) conditions.push(eq(contexts.status, criteria.status))
  if (criteria.scope !== null) conditions.push(eq(contexts.scopeKind, criteria.scope))
  if (criteria.collectionId === UNCATEGORIZED_COLLECTION_ID)
    conditions.push(isNull(contexts.collectionId))
  else if (criteria.collectionId !== null)
    conditions.push(eq(contexts.collectionId, criteria.collectionId))
  // ET : chaque tag demandé doit être porté par le contexte.
  for (const tag of criteria.tags) {
    conditions.push(
      sql`exists (select 1 from ${contextTags} where ${contextTags.contextId} = ${contexts.id} and ${contextTags.tagName} = ${tag})`,
    )
  }
  return conditions
}

function draftColumns(
  contextId: string,
  draft: RevisionWrite,
  baseVersion: number | null,
  at: Date,
) {
  return {
    contextId,
    baseVersion,
    number: draft.number,
    content: draft.content,
    note: draft.note,
    authorId: draft.authorId,
    updatedAt: isoDate(at),
    tokenEstimate: draft.tokenEstimate,
  }
}

/** Contextes sur SQLite (Drizzle). La pertinence FTS n'est pas utilisée pour trier la Bibliothèque. */
export class DrizzleContextStore implements ContextStore {
  constructor(
    private readonly db: AppDatabase,
    private readonly searchIndex: ContextSearchIndex,
    private readonly clock: Clock,
  ) {}

  search(viewer: Viewer, criteria: LibraryCriteria): Promise<ContextSearchResult> {
    return deferred(() => {
      const totals = this.statusCounts(viewer)
      const conditions = [visibleTo(viewer), ...filterConditions(criteria)]
      if (queryTerms(criteria.query).length > 0) {
        const ids = this.searchIndex.match(this.db, criteria.query, 'library')
        if (ids.length === 0) return { page: toPage([], 0, pageWindow(0, 1)), totals }
        conditions.push(inArray(contexts.id, ids))
      }
      const where = and(...conditions)
      const total = this.db.select({ total: count() }).from(contexts).where(where).get()?.total ?? 0
      const window = pageWindow(total, criteria.page)
      const rows = this.db
        .select()
        .from(contexts)
        .where(where)
        .orderBy(...orderOf(criteria.sort))
        .limit(window.pageSize)
        .offset(window.offset)
        .all()
      return { page: toPage(hydrate(this.db, rows, this.clock.now()), total, window), totals }
    })
  }

  find(viewer: Viewer, reference: string): Promise<ContextDetail | null> {
    return deferred(() => {
      const row = this.db
        .select()
        .from(contexts)
        .where(and(visibleTo(viewer), or(eq(contexts.id, reference), eq(contexts.slug, reference))))
        .get()
      if (!row) return null
      const [context] = hydrate(this.db, [row], this.clock.now())
      if (!context) return null
      const collection =
        row.collectionId === null
          ? undefined
          : this.db
              .select({ name: collections.name })
              .from(collections)
              .where(eq(collections.id, row.collectionId))
              .get()
      return {
        context,
        history: history(this.db, row.id),
        collectionName: collection?.name ?? null,
      }
    })
  }

  isSlugTaken(slug: string, exceptId: ContextId | null): Promise<boolean> {
    return deferred(() => {
      const bySlug = eq(contexts.slug, slug)
      const where = exceptId === null ? bySlug : and(bySlug, ne(contexts.id, exceptId))
      return this.db.select({ id: contexts.id }).from(contexts).where(where).get() !== undefined
    })
  }

  countByScope(viewer: Viewer): Promise<Readonly<Record<ScopeKind, number>>> {
    return deferred(() => {
      const rows = this.db
        .select({ kind: contexts.scopeKind, total: count() })
        .from(contexts)
        .where(visibleTo(viewer))
        .groupBy(contexts.scopeKind)
        .all()
      const counts: Record<ScopeKind, number> = { personal: 0, project: 0, team: 0 }
      for (const kind of SCOPE_KINDS)
        counts[kind] = rows.find((row) => row.kind === kind)?.total ?? 0
      return counts
    })
  }

  create({ id, metadata, draft, at }: CreateContextCommand): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        const now = isoDate(at)
        tx.insert(contexts)
          .values({
            id,
            ...metadataColumns(metadata),
            status: 'draft',
            publishedVersion: null,
            authorId: draft.authorId,
            createdAt: now,
            updatedAt: now,
          })
          .run()
        writeTags(tx, id, metadata.tags, at)
        tx.insert(contextDrafts)
          .values(draftColumns(id, draft, null, at))
          .run()
        reindex(tx, this.searchIndex, id)
      })
    })
  }

  saveDraft({ id, expectedPublishedVersion, metadata, draft, at }: SaveDraftWrite): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        this.assertPublishedVersion(tx, id, expectedPublishedVersion)
        tx.update(contexts)
          .set({ ...metadataColumns(metadata), updatedAt: isoDate(at) })
          .where(eq(contexts.id, id))
          .run()
        writeTags(tx, id, metadata.tags, at)
        const values = draftColumns(id, draft, expectedPublishedVersion, at)
        tx.insert(contextDrafts)
          .values(values)
          .onConflictDoUpdate({ target: contextDrafts.contextId, set: values })
          .run()
        reindex(tx, this.searchIndex, id)
      })
    })
  }

  publish({
    id,
    expectedPublishedVersion,
    metadata,
    version,
    falsePositives,
    at,
  }: PublishWrite): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        this.assertPublishedVersion(tx, id, expectedPublishedVersion)
        const now = isoDate(at)
        tx.insert(contextVersions)
          .values({
            contextId: id,
            number: version.number,
            content: version.content,
            note: version.note,
            authorId: version.authorId,
            createdAt: now,
            tokenEstimate: version.tokenEstimate,
            falsePositives: JSON.stringify(falsePositives),
          })
          .run()
        tx.update(contexts)
          .set({
            ...metadataColumns(metadata),
            status: 'published',
            publishedVersion: version.number,
            updatedAt: now,
          })
          .where(eq(contexts.id, id))
          .run()
        tx.delete(contextDrafts).where(eq(contextDrafts.contextId, id)).run()
        writeTags(tx, id, metadata.tags, at)
        reindex(tx, this.searchIndex, id)
      })
    })
  }

  restoreDraft({ id, draft, at }: RestoreDraftWrite): Promise<void> {
    return deferred(() => {
      this.db.transaction((tx) => {
        const published = this.publishedVersionOf(tx, id)
        const values = draftColumns(id, draft, published, at)
        tx.insert(contextDrafts)
          .values(values)
          .onConflictDoUpdate({ target: contextDrafts.contextId, set: values })
          .run()
        reindex(tx, this.searchIndex, id)
      })
    })
  }

  setStatus({ id, status, at }: StatusWrite): Promise<void> {
    return deferred(() => {
      const result = this.db
        .update(contexts)
        .set({ status, updatedAt: isoDate(at) })
        .where(eq(contexts.id, id))
        .run()
      if (result.changes === 0) throw new ContextNotFoundError(id)
    })
  }

  private statusCounts(viewer: Viewer): StatusCounts {
    const rows = this.db
      .select({ status: contexts.status, total: count() })
      .from(contexts)
      .where(visibleTo(viewer))
      .groupBy(contexts.status)
      .all()
    const counts: Record<ContextStatus, number> = { published: 0, draft: 0, archived: 0 }
    for (const status of CONTEXT_STATUSES) {
      counts[status] = rows.find((row) => row.status === status)?.total ?? 0
    }
    return { ...counts, total: counts.published + counts.draft + counts.archived }
  }

  /** @throws ContextNotFoundError */
  private publishedVersionOf(db: SyncDb, id: string): number | null {
    const row = db
      .select({ publishedVersion: contexts.publishedVersion })
      .from(contexts)
      .where(eq(contexts.id, id))
      .get()
    if (!row) throw new ContextNotFoundError(id)
    return row.publishedVersion
  }

  /**
   * Concurrence optimiste : vérifiée dans la transaction de l'écriture.
   * @throws VersionConflictError avec la version publiée entre-temps.
   */
  private assertPublishedVersion(db: SyncDb, id: string, expected: number | null): void {
    const current = this.publishedVersionOf(db, id)
    if (current === expected) return
    const latest = current === null ? null : versionOf(db, id, current)
    throw new VersionConflictError(expected ?? 0, current ?? 0, latest ?? undefined)
  }
}
