/**
 * Schéma Drizzle de Context Hub.
 *
 * Portable vers Postgres : uniquement des colonnes `text` / `integer`, dates en ISO 8601 UTC
 * (`Date#toISOString()`, triables lexicographiquement), JSON sérialisé en `text`, aucune fonction SQL
 * propre à SQLite. Le seul SQL spécifique (FTS5, trigger d'immuabilité) vit dans la migration custom
 * `drizzle/0001_*.sql` et dans `search/Fts5SearchIndex.ts`.
 */
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

/** Jetons d'API : seul le hash sha-256 est stocké, jamais le jeton. */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    label: text('label').notNull(),
    createdAt: text('created_at').notNull(),
    lastUsedAt: text('last_used_at'),
  },
  (table) => [index('api_tokens_user_idx').on(table.userId)],
)

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  /** « Sans collection » : ni renommable, ni supprimable. */
  system: integer('system', { mode: 'boolean' }).notNull().default(false),
  /** Ordre d'affichage (la collection système reste en dernier). */
  position: integer('position').notNull(),
})

export const contexts = sqliteTable(
  'contexts',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    /** Clé de tri du titre (sans casse ni accents), calculée par le domaine. */
    titleSortKey: text('title_sort_key').notNull(),
    description: text('description').notNull(),
    /** null = « Sans collection ». */
    collectionId: text('collection_id').references(() => collections.id),
    scopeKind: text('scope_kind', { enum: ['personal', 'project', 'team'] }).notNull(),
    /** Propriétaire (personal), repo (project) ou équipe (team). */
    scopeValue: text('scope_value').notNull(),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull(),
    /** Numéro de la version lue par les sessions MCP, null si jamais publié. */
    publishedVersion: integer('published_version'),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('contexts_status_idx').on(table.status),
    index('contexts_updated_idx').on(table.updatedAt),
    index('contexts_scope_idx').on(table.scopeKind, table.scopeValue),
    index('contexts_collection_idx').on(table.collectionId),
  ],
)

/** Versions publiées. IMMUABLES : jamais d'UPDATE (trigger + aucune méthode d'écriture hors insert). */
export const contextVersions = sqliteTable(
  'context_versions',
  {
    contextId: text('context_id')
      .notNull()
      .references(() => contexts.id),
    number: integer('number').notNull(),
    content: text('content').notNull(),
    note: text('note').notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    tokenEstimate: integer('token_estimate').notNull(),
    /** Faux positifs du scan déclarés à la publication (JSON `FalsePositive[]`), pour relecture. */
    falsePositives: text('false_positives').notNull().default('[]'),
  },
  (table) => [primaryKey({ columns: [table.contextId, table.number] })],
)

/** Brouillon en cours au-dessus de la version publiée : un seul par contexte. */
export const contextDrafts = sqliteTable('context_drafts', {
  contextId: text('context_id')
    .primaryKey()
    .references(() => contexts.id),
  /** Version publiée sur laquelle le brouillon a été commencé (null si jamais publié). */
  baseVersion: integer('base_version'),
  number: integer('number').notNull(),
  content: text('content').notNull(),
  note: text('note').notNull(),
  authorId: text('author_id')
    .notNull()
    .references(() => users.id),
  updatedAt: text('updated_at').notNull(),
  tokenEstimate: integer('token_estimate').notNull(),
})

/** Registre des tags : un tag existe indépendamment des contextes. */
export const tags = sqliteTable('tags', {
  name: text('name').primaryKey(),
  lastUsedAt: text('last_used_at'),
})

export const contextTags = sqliteTable(
  'context_tags',
  {
    contextId: text('context_id')
      .notNull()
      .references(() => contexts.id),
    tagName: text('tag_name')
      .notNull()
      .references(() => tags.name),
    /** Ordre des tags du contexte, tel que saisi. */
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contextId, table.tagName] }),
    index('context_tags_tag_idx').on(table.tagName),
  ],
)

/** Lectures MCP (resource ou `get_context`) : alimente `mcpReads7d`. */
export const mcpReads = sqliteTable(
  'mcp_reads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    contextId: text('context_id')
      .notNull()
      .references(() => contexts.id),
    version: integer('version').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    at: text('at').notNull(),
  },
  (table) => [index('mcp_reads_context_at_idx').on(table.contextId, table.at)],
)
