/**
 * Seed de démo : reprend exactement les fixtures du front (packages/domain/src/fixtures), pour que
 * tous les compteurs des maquettes se retrouvent côté serveur.
 */
import { slugify } from '@context-hub/domain/context/slug.ts'
import type { ContextVersion } from '@context-hub/domain/context/types.ts'
import { titleSortKey } from '@context-hub/domain/library/criteria.ts'
import { COLLECTION_FIXTURES } from '@context-hub/domain/fixtures/collections.ts'
import { CONTEXT_FIXTURES, type ContextRecord } from '@context-hub/domain/fixtures/contexts.ts'
import { TAG_FIXTURES } from '@context-hub/domain/fixtures/tags.ts'

import { generateApiToken, hashApiToken } from '../../../application/auth/apiToken.ts'
import type { SyncDb } from '../connection.ts'
import { isoDate, toUtcIso } from '../dates.ts'
import {
  apiTokens,
  collections,
  contextDrafts,
  contexts,
  contextTags,
  contextVersions,
  mcpReads,
  tags,
  users,
} from '../schema.ts'
import type { ContextSearchIndex } from '../search/ContextSearchIndex.ts'
import { publishedMetadataColumns, reindex, scopeColumns } from '../stores/contextRecords.ts'

/** Utilisateur de dev : seul porteur d'un jeton, propriétaire des contextes `personal` de démo. */
export const DEV_USER = { id: 'brice', name: 'Brice' } as const

/** Les lectures MCP de démo sont étalées sur les 6 derniers jours (fenêtre `mcpReads7d` : 7 jours). */
const READS_SPAN_MS = 6 * 24 * 60 * 60 * 1000

/** Identifiant d'un auteur des fixtures (« Camille » → « camille »). */
export function userIdOf(name: string): string {
  return slugify(name)
}

function versionsOf({ context, history }: ContextRecord): ContextVersion[] {
  return [...history, ...(context.draft ? [context.draft] : [])]
}

function authorsOf(records: readonly ContextRecord[]): string[] {
  const names = records.flatMap((record) => [
    record.context.author,
    ...versionsOf(record).map((version) => version.author),
  ])
  return [...new Set([DEV_USER.name, ...names])]
}

function seedContext(db: SyncDb, record: ContextRecord, now: Date): void {
  const { context, history } = record
  db.insert(contexts)
    .values({
      id: context.id,
      slug: context.slug,
      title: context.title,
      titleSortKey: titleSortKey(context.title),
      description: context.description,
      collectionId: context.collectionId,
      ...scopeColumns(context.scope),
      status: context.status,
      publishedVersion: context.publishedVersion?.number ?? null,
      // Démo : les métadonnées publiées sont celles des fixtures.
      ...(context.publishedVersion ? publishedMetadataColumns(context) : {}),
      authorId: userIdOf(context.author),
      createdAt: toUtcIso(context.createdAt),
      updatedAt: toUtcIso(context.updatedAt),
    })
    .run()
  for (const version of history) {
    db.insert(contextVersions)
      .values({
        contextId: context.id,
        number: version.number,
        content: version.content,
        note: version.note,
        authorId: userIdOf(version.author),
        createdAt: toUtcIso(version.createdAt),
        tokenEstimate: version.tokenEstimate,
      })
      .run()
  }
  if (context.draft) {
    db.insert(contextDrafts)
      .values({
        contextId: context.id,
        baseVersion: context.publishedVersion?.number ?? null,
        number: context.draft.number,
        content: context.draft.content,
        note: context.draft.note,
        authorId: userIdOf(context.draft.author),
        updatedAt: toUtcIso(context.draft.createdAt),
        tokenEstimate: context.draft.tokenEstimate,
      })
      .run()
  }
  if (context.tags.length > 0) {
    db.insert(contextTags)
      .values(
        context.tags.map((tagName, position) => ({ contextId: context.id, tagName, position })),
      )
      .run()
  }
  seedMcpReads(db, record, now)
}

/** `mcpReads7d` lectures de démo, étalées sur les 6 derniers jours, par l'utilisateur de dev. */
function seedMcpReads(db: SyncDb, { context }: ContextRecord, now: Date): void {
  const version = context.publishedVersion?.number ?? context.draft?.number ?? 1
  for (let index = 0; index < context.mcpReads7d; index += 1) {
    const offset = Math.round(((index + 1) * READS_SPAN_MS) / (context.mcpReads7d + 1))
    db.insert(mcpReads)
      .values({
        contextId: context.id,
        version,
        userId: DEV_USER.id,
        at: isoDate(new Date(now.getTime() - offset)),
      })
      .run()
  }
}

export interface SeedOptions {
  /** « Maintenant » du seed : les lectures MCP de démo sont datées des 7 jours précédents. */
  readonly now: Date
  readonly searchIndex: ContextSearchIndex
  /** Jeton imposé (tests) ; sinon un jeton aléatoire est généré. */
  readonly token?: string
}

export interface SeedResult {
  /** Jeton de dev en clair : à afficher UNE fois, il n'est stocké que haché. */
  readonly token: string
}

/** Remplit une base vide avec les données de démo et un jeton pour l'utilisateur de dev. */
export function seedDemoData(db: SyncDb, { now, searchIndex, token }: SeedOptions): SeedResult {
  const issued = token ?? generateApiToken()
  db.transaction((tx) => {
    tx.insert(users)
      .values(authorsOf(CONTEXT_FIXTURES).map((name) => ({ id: userIdOf(name), name })))
      .run()
    tx.insert(collections)
      .values(
        COLLECTION_FIXTURES.map((collection, position) => ({
          id: collection.id,
          name: collection.name,
          description: collection.description,
          system: collection.system === true,
          position,
        })),
      )
      .run()
    tx.insert(tags)
      .values(
        TAG_FIXTURES.map((tag) => ({
          name: tag.name,
          lastUsedAt: tag.lastUsedAt === null ? null : toUtcIso(tag.lastUsedAt),
        })),
      )
      .run()
    for (const record of CONTEXT_FIXTURES) seedContext(tx, record, now)
    for (const record of CONTEXT_FIXTURES) reindex(tx, searchIndex, record.context.id)
    tx.insert(apiTokens)
      .values({
        tokenHash: hashApiToken(issued),
        userId: DEV_USER.id,
        label: 'Jeton de dev (seed)',
        createdAt: isoDate(now),
        lastUsedAt: null,
      })
      .run()
  })
  return { token: issued }
}

/** Vrai si la base contient déjà des données (le seed ne s'applique qu'à une base vide). */
export function isSeeded(db: SyncDb): boolean {
  return db.select({ id: users.id }).from(users).limit(1).get() !== undefined
}
