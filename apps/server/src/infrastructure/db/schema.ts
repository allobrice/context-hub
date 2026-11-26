/**
 * Schéma Drizzle de Context Hub.
 *
 * Portable vers Postgres : uniquement des colonnes `text` / `integer`, dates en ISO 8601 UTC
 * (`Date#toISOString()`, triables lexicographiquement), JSON sérialisé en `text`, aucune fonction SQL
 * propre à SQLite. Le seul SQL spécifique (FTS5, triggers d'immuabilité) vit dans les migrations custom
 * `drizzle/0001_*.sql` et `drizzle/0006_*.sql`, et dans `search/Fts5SearchIndex.ts`.
 */
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

import { SCOPE_KINDS } from '@context-hub/domain/context/types.ts'
import {
  MISSION_EVENT_TYPES,
  MISSION_STATUSES,
  PRIORITIES,
} from '@context-hub/domain/missions/types.ts'

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
    scopeKind: text('scope_kind', { enum: SCOPE_KINDS }).notNull(),
    /** Propriétaire (personal), repo (project) ou équipe (team). */
    scopeValue: text('scope_value').notNull(),
    /** Modèle réutilisable à publier comme prompt MCP (brouillon compris). */
    exposeAsPrompt: integer('expose_as_prompt', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['draft', 'published', 'archived'] }).notNull(),
    /** Numéro de la version lue par les sessions MCP, null si jamais publié. */
    publishedVersion: integer('published_version'),
    // Métadonnées PUBLIÉES, écrites seulement à la publication (après le scan) : c'est tout ce que
    // voit MCP. Les colonnes ci-dessus sont les métadonnées courantes (brouillon compris) de l'UI.
    publishedTitle: text('published_title'),
    publishedDescription: text('published_description'),
    publishedCollectionId: text('published_collection_id').references(() => collections.id),
    publishedScopeKind: text('published_scope_kind', { enum: SCOPE_KINDS }),
    publishedScopeValue: text('published_scope_value'),
    /** Tags publiés, en JSON (`string[]`). */
    publishedTags: text('published_tags').notNull().default('[]'),
    /** Exposé comme prompt MCP : seule valeur lue par `prompts/list` (SPEC §8.5). */
    publishedExposeAsPrompt: integer('published_expose_as_prompt', { mode: 'boolean' })
      .notNull()
      .default(false),
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
    index('contexts_published_scope_idx').on(table.publishedScopeKind, table.publishedScopeValue),
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

// ── Workspaces (SPEC §7) ──────────────────────────────────────────────────────

/**
 * Workspaces. `next_seq` est le compteur des entrées : lu et incrémenté dans la transaction
 * IMMEDIATE de chaque insertion (jamais de `MAX(seq) + 1`), d'où des `seq` sans trou ni doublon.
 */
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    goal: text('goal').notNull(),
    status: text('status', { enum: ['open', 'closed'] }).notNull(),
    /** Repos du workspace, en JSON (`string[]`). */
    repos: text('repos').notNull().default('[]'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at').notNull(),
    lastActivityAt: text('last_activity_at').notNull(),
    closedAt: text('closed_at'),
    closedBy: text('closed_by').references(() => users.id),
    /** Prochain `seq` à attribuer (commence à 1). */
    nextSeq: integer('next_seq').notNull().default(1),
  },
  (table) => [index('workspaces_status_activity_idx').on(table.status, table.lastActivityAt)],
)

/** Qui a accès à un workspace : son créateur et les invités. */
export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['creator', 'member'] }).notNull(),
    addedAt: text('added_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_members_user_idx').on(table.userId),
  ],
)

/** Contextes liés à un workspace (inclus dans le résumé injecté aux sessions). */
export const workspaceLinkedContexts = sqliteTable(
  'workspace_linked_contexts',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    contextId: text('context_id')
      .notNull()
      .references(() => contexts.id),
    position: integer('position').notNull(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.contextId] })],
)

/**
 * Journal. Le corps est stocké APRÈS le scan : un secret n'est jamais écrit en base. Auteur : une
 * session (`author_user_id`, `author_session_label`, `author_repo`) ou le serveur (`system_source`).
 */
export const workspaceEntries = sqliteTable(
  'workspace_entries',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    seq: integer('seq').notNull(),
    kind: text('kind', {
      enum: ['note', 'decision', 'question', 'handoff', 'status', 'system'],
    }).notNull(),
    body: text('body').notNull(),
    /** Fichiers cités, en JSON (`string[]`). */
    files: text('files').notNull().default('[]'),
    authorUserId: text('author_user_id').references(() => users.id),
    authorSessionLabel: text('author_session_label'),
    authorRepo: text('author_repo'),
    systemSource: text('system_source', { enum: ['claim', 'hook', 'lifecycle'] }),
    redactions: integer('redactions').notNull().default(0),
    suspicious: integer('suspicious', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.seq] }),
    index('workspace_entries_kind_idx').on(table.workspaceId, table.kind),
  ],
)

/** Zones réservées. Un claim expiré n'est plus opposable ; il est purgé (avec une entrée système). */
export const workspaceClaims = sqliteTable(
  'workspace_claims',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    repo: text('repo').notNull(),
    area: text('area').notNull(),
    holderUserId: text('holder_user_id')
      .notNull()
      .references(() => users.id),
    holderSessionLabel: text('holder_session_label').notNull(),
    holderRepo: text('holder_repo'),
    acquiredAt: text('acquired_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    /** Durée de renouvellement par l'activité de la session. */
    ttlMinutes: integer('ttl_minutes').notNull(),
  },
  (table) => [
    index('workspace_claims_lookup_idx').on(table.workspaceId, table.repo, table.expiresAt),
    index('workspace_claims_holder_idx').on(
      table.workspaceId,
      table.holderUserId,
      table.holderSessionLabel,
    ),
    index('workspace_claims_expires_idx').on(table.expiresAt),
  ],
)

/** Sessions qui ont rejoint un workspace : une par (utilisateur, label). */
export const workspaceParticipants = sqliteTable(
  'workspace_participants',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    sessionLabel: text('session_label').notNull(),
    repo: text('repo'),
    joinedAt: text('joined_at').notNull(),
    lastSeenAt: text('last_seen_at').notNull(),
    /** Prochain `seq` à lire. */
    cursor: integer('cursor').notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId, table.sessionLabel] })],
)

// ── Missions (SPEC §8) ────────────────────────────────────────────────────────

/**
 * Missions. Les références de session (origine, fraîcheur, prise) sont stockées à plat (utilisateur,
 * label, repo) ; le nom de l'utilisateur est joint à la lecture. Les listes et le résultat sont du JSON.
 * Seul le hash du jeton de réservation est stocké.
 */
export const missions = sqliteTable(
  'missions',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    prompt: text('prompt').notNull(),
    priority: text('priority', { enum: PRIORITIES }).notNull(),
    status: text('status', { enum: MISSION_STATUSES }).notNull(),
    scopeKind: text('scope_kind', { enum: SCOPE_KINDS }).notNull(),
    scopeValue: text('scope_value').notNull(),
    originLabel: text('origin_label').notNull(),
    originBatchId: text('origin_batch_id'),
    originUserId: text('origin_user_id').references(() => users.id),
    originSessionLabel: text('origin_session_label'),
    originRepo: text('origin_repo'),
    createdBy: text('created_by')
      .notNull()
      .references(() => users.id),
    codeRefRepo: text('code_ref_repo').notNull(),
    codeRefCommit: text('code_ref_commit').notNull(),
    /** JSON `string[]`. */
    codeRefFiles: text('code_ref_files').notNull().default('[]'),
    freshnessCheckedAt: text('freshness_checked_at'),
    /** JSON `string[]`. */
    freshnessChangedFiles: text('freshness_changed_files'),
    freshnessUserId: text('freshness_user_id').references(() => users.id),
    freshnessSessionLabel: text('freshness_session_label'),
    freshnessRepo: text('freshness_repo'),
    /** JSON `string[]`. */
    linkedContextIds: text('linked_context_ids').notNull().default('[]'),
    workspaceId: text('workspace_id').references(() => workspaces.id),
    /** Instruction suspecte conservée (mission créée par un humain). */
    suspicious: integer('suspicious', { mode: 'boolean' }).notNull().default(false),
    validationBy: text('validation_by').references(() => users.id),
    validationAt: text('validation_at'),
    claimUserId: text('claim_user_id').references(() => users.id),
    claimSessionLabel: text('claim_session_label'),
    claimRepo: text('claim_repo'),
    claimAcquiredAt: text('claim_acquired_at'),
    claimExpiresAt: text('claim_expires_at'),
    /** sha-256 du jeton de réservation renvoyé par `take` (jamais le jeton). */
    claimTokenHash: text('claim_token_hash'),
    /** JSON `MissionResult`. */
    result: text('result'),
    dropReason: text('drop_reason'),
    createdAt: text('created_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    closedAt: text('closed_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    /** File : prêtes, par priorité puis ancienneté. */
    index('missions_queue_idx').on(table.status, table.priority, table.createdAt),
    index('missions_expires_idx').on(table.status, table.expiresAt),
    index('missions_claim_expires_idx').on(table.claimExpiresAt),
    index('missions_holder_idx').on(table.claimUserId, table.claimSessionLabel),
    index('missions_batch_idx').on(table.originBatchId),
    index('missions_repo_idx').on(table.codeRefRepo),
  ],
)

/** Tags d'une mission : texte libre validé, sans lien avec le registre de la bibliothèque. */
export const missionTags = sqliteTable(
  'mission_tags',
  {
    missionId: text('mission_id')
      .notNull()
      .references(() => missions.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    /** Ordre des tags, tel que saisi. */
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.missionId, table.tag] }),
    index('mission_tags_tag_idx').on(table.tag, table.missionId),
  ],
)

/**
 * Journal du cycle de vie, APPEND-ONLY (triggers en défense en profondeur, migration 0006). Sans clé
 * étrangère : l'événement de rejet survit à la suppression de la mission, d'où la copie du slug et
 * du titre. `id` ordonne deux événements de la même milliseconde.
 */
export const missionEvents = sqliteTable(
  'mission_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    missionId: text('mission_id').notNull(),
    missionSlug: text('mission_slug').notNull(),
    missionTitle: text('mission_title').notNull(),
    at: text('at').notNull(),
    type: text('type', { enum: MISSION_EVENT_TYPES }).notNull(),
    /** Session ou humain ; null pour le job. */
    actorUserId: text('actor_user_id'),
    /** Label de session ; null pour un humain ou le job. */
    actorSessionLabel: text('actor_session_label'),
    actorRepo: text('actor_repo'),
    /** `job` pour le job de maintenance. */
    actorSystem: text('actor_system', { enum: ['job'] }),
    detail: text('detail'),
  },
  (table) => [index('mission_events_mission_idx').on(table.missionId, table.id)],
)
