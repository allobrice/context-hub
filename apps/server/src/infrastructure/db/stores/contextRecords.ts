/**
 * Lecture et écriture des agrégats « contexte » partagées par les stores : visibilité, hydratation
 * (tags, versions, brouillon, lectures MCP), tags d'un contexte et réindexation plein texte.
 */
import { and, asc, count, desc, eq, gte, inArray, sql, type SQL } from 'drizzle-orm'

import type {
  Context,
  ContextVersion,
  Scope,
  ScopeKind,
} from '@context-hub/domain/context/types.ts'
import { toContextId } from '@context-hub/domain/context/types.ts'
import { titleSortKey } from '@context-hub/domain/library/criteria.ts'

import type { ContextMetadata } from '../../../application/ports/ContextStore.ts'
import type { Viewer } from '../../../application/viewer.ts'
import type { SyncDb } from '../connection.ts'
import { isoDate } from '../dates.ts'
import {
  contextDrafts,
  contexts,
  contextTags,
  contextVersions,
  mcpReads,
  tags,
  users,
} from '../schema.ts'
import type { ContextSearchIndex } from '../search/ContextSearchIndex.ts'

export type ContextRow = typeof contexts.$inferSelect
type VersionRow = typeof contextVersions.$inferSelect
type DraftRow = typeof contextDrafts.$inferSelect

const MCP_READS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/** Portées : `personal` réservée à son propriétaire ; `team` et `project` visibles de tous. */
export function visibleTo(viewer: Viewer): SQL {
  return sql`(${contexts.scopeKind} <> 'personal' or ${contexts.scopeValue} = ${viewer.userId})`
}

export function scopeOf(kind: ScopeKind, value: string): Scope {
  switch (kind) {
    case 'personal':
      return { kind, owner: value }
    case 'project':
      return { kind, repo: value }
    case 'team':
      return { kind, team: value }
  }
}

export function scopeColumns(scope: Scope): { scopeKind: ScopeKind; scopeValue: string } {
  switch (scope.kind) {
    case 'personal':
      return { scopeKind: scope.kind, scopeValue: scope.owner }
    case 'project':
      return { scopeKind: scope.kind, scopeValue: scope.repo }
    case 'team':
      return { scopeKind: scope.kind, scopeValue: scope.team }
  }
}

function groupBy<T, K>(items: readonly T[], keyOf: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return groups
}

/** Nom affiché des auteurs (users.name), par identifiant. */
function authorNames(db: SyncDb, ids: readonly string[]): Map<string, string> {
  if (ids.length === 0) return new Map()
  const rows = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]))
    .all()
  return new Map(rows.map((row) => [row.id, row.name]))
}

function toVersion(row: VersionRow, names: ReadonlyMap<string, string>): ContextVersion {
  return {
    number: row.number,
    content: row.content,
    note: row.note,
    author: names.get(row.authorId) ?? row.authorId,
    createdAt: row.createdAt,
    tokenEstimate: row.tokenEstimate,
  }
}

function draftVersion(row: DraftRow, names: ReadonlyMap<string, string>): ContextVersion {
  return {
    number: row.number,
    content: row.content,
    note: row.note,
    author: names.get(row.authorId) ?? row.authorId,
    createdAt: row.updatedAt,
    tokenEstimate: row.tokenEstimate,
  }
}

/** Tags de chaque contexte, dans l'ordre saisi. */
export function tagsByContext(db: SyncDb, ids: readonly string[]): Map<string, string[]> {
  if (ids.length === 0) return new Map()
  const rows = db
    .select({ contextId: contextTags.contextId, tagName: contextTags.tagName })
    .from(contextTags)
    .where(inArray(contextTags.contextId, [...ids]))
    .orderBy(asc(contextTags.position))
    .all()
  const grouped = groupBy(rows, (row) => row.contextId)
  return new Map([...grouped].map(([id, group]) => [id, group.map((row) => row.tagName)]))
}

/** Assemble les agrégats du domaine pour `rows`, en conservant leur ordre (4 à 6 requêtes en tout). */
export function hydrate(db: SyncDb, rows: readonly ContextRow[], now: Date): Context[] {
  if (rows.length === 0) return []
  const ids = rows.map((row) => row.id)
  const tagLists = tagsByContext(db, ids)

  const published = db
    .select({ version: contextVersions })
    .from(contextVersions)
    .innerJoin(
      contexts,
      and(
        eq(contextVersions.contextId, contexts.id),
        eq(contextVersions.number, contexts.publishedVersion),
      ),
    )
    .where(inArray(contexts.id, ids))
    .all()
    .map((row) => row.version)
  const drafts = db.select().from(contextDrafts).where(inArray(contextDrafts.contextId, ids)).all()

  const since = isoDate(new Date(now.getTime() - MCP_READS_WINDOW_MS))
  const reads = db
    .select({ contextId: mcpReads.contextId, reads: count() })
    .from(mcpReads)
    .where(and(inArray(mcpReads.contextId, ids), gte(mcpReads.at, since)))
    .groupBy(mcpReads.contextId)
    .all()

  const names = authorNames(db, [
    ...rows.map((row) => row.authorId),
    ...published.map((row) => row.authorId),
    ...drafts.map((row) => row.authorId),
  ])
  const publishedById = new Map(published.map((row) => [row.contextId, row]))
  const draftById = new Map(drafts.map((row) => [row.contextId, row]))
  const readsById = new Map(reads.map((row) => [row.contextId, row.reads]))

  return rows.map((row) => {
    const publishedRow = publishedById.get(row.id)
    const draftRow = draftById.get(row.id)
    return {
      id: toContextId(row.id),
      slug: row.slug,
      title: row.title,
      description: row.description,
      collectionId: row.collectionId,
      tags: tagLists.get(row.id) ?? [],
      scope: scopeOf(row.scopeKind, row.scopeValue),
      status: row.status,
      publishedVersion: publishedRow ? toVersion(publishedRow, names) : null,
      draft: draftRow ? draftVersion(draftRow, names) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      author: names.get(row.authorId) ?? row.authorId,
      mcpReads7d: readsById.get(row.id) ?? 0,
    }
  })
}

/** Versions publiées d'un contexte, de la plus récente à la plus ancienne. */
export function history(db: SyncDb, contextId: string): ContextVersion[] {
  const rows = db
    .select()
    .from(contextVersions)
    .where(eq(contextVersions.contextId, contextId))
    .orderBy(desc(contextVersions.number))
    .all()
  const names = authorNames(
    db,
    rows.map((row) => row.authorId),
  )
  return rows.map((row) => toVersion(row, names))
}

/** Version `number` d'un contexte, avec le nom de son auteur. */
export function versionOf(db: SyncDb, contextId: string, number: number): ContextVersion | null {
  const row = db
    .select()
    .from(contextVersions)
    .where(and(eq(contextVersions.contextId, contextId), eq(contextVersions.number, number)))
    .get()
  if (!row) return null
  return toVersion(row, authorNames(db, [row.authorId]))
}

/** Déclare les tags au registre (dernier usage = `at`) et réécrit ceux du contexte, dans l'ordre. */
export function writeTags(db: SyncDb, contextId: string, names: readonly string[], at: Date): void {
  const unique = [...new Set(names)]
  const lastUsedAt = isoDate(at)
  for (const name of unique) {
    db.insert(tags)
      .values({ name, lastUsedAt })
      .onConflictDoUpdate({ target: tags.name, set: { lastUsedAt } })
      .run()
  }
  db.delete(contextTags).where(eq(contextTags.contextId, contextId)).run()
  if (unique.length > 0) {
    db.insert(contextTags)
      .values(unique.map((tagName, position) => ({ contextId, tagName, position })))
      .run()
  }
}

/** Colonnes de métadonnées d'un contexte, prêtes pour un insert ou un update. */
export function metadataColumns(metadata: ContextMetadata) {
  return {
    slug: metadata.slug,
    title: metadata.title,
    titleSortKey: titleSortKey(metadata.title),
    description: metadata.description,
    collectionId: metadata.collectionId,
    ...scopeColumns(metadata.scope),
  }
}

/** Recalcule l'entrée plein texte d'un contexte à partir de l'état en base. */
export function reindex(db: SyncDb, index: ContextSearchIndex, contextId: string): void {
  const row = db.select().from(contexts).where(eq(contexts.id, contextId)).get()
  if (!row) return
  const publishedContent =
    row.publishedVersion === null
      ? null
      : (db
          .select({ content: contextVersions.content })
          .from(contextVersions)
          .where(
            and(
              eq(contextVersions.contextId, contextId),
              eq(contextVersions.number, row.publishedVersion),
            ),
          )
          .get()?.content ?? null)
  const draftContent =
    db
      .select({ content: contextDrafts.content })
      .from(contextDrafts)
      .where(eq(contextDrafts.contextId, contextId))
      .get()?.content ?? null
  index.upsert(db, {
    contextId,
    title: row.title,
    description: row.description,
    slug: row.slug,
    tags: tagsByContext(db, [contextId]).get(contextId) ?? [],
    publishedContent,
    draftContent,
  })
}
