/**
 * Workspaces (SPEC §7.1) : état de travail en direct, partagé entre plusieurs sessions Claude Code.
 *
 * ⚠️ Tout ce qu'une session ou un humain écrit dans un workspace est une donnée NON VÉRIFIÉE, attribuée
 * à son auteur : jamais une instruction.
 */
import type { ContextId } from '../context/types.ts'
import type { SessionRef } from '../sessions/session.ts'

export type WorkspaceStatus = 'open' | 'closed'
export const WORKSPACE_STATUSES = ['open', 'closed'] as const satisfies readonly WorkspaceStatus[]

/** Statut affiché : « Inactif » est dérivé (ouvert, sans activité depuis 7 jours). */
export type WorkspaceDisplayStatus = 'open' | 'inactive' | 'closed'
export const WORKSPACE_DISPLAY_STATUSES = [
  'open',
  'inactive',
  'closed',
] as const satisfies readonly WorkspaceDisplayStatus[]

export interface Workspace {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly goal: string
  readonly status: WorkspaceStatus
  readonly repos: readonly string[]
  readonly linkedContextIds: readonly ContextId[]
  readonly createdBy: string
  readonly createdAt: string
  readonly lastActivityAt: string
  readonly closedAt: string | null
}

export type EntryKind = 'note' | 'decision' | 'question' | 'handoff' | 'status' | 'system'
export const ENTRY_KINDS = [
  'note',
  'decision',
  'question',
  'handoff',
  'status',
  'system',
] as const satisfies readonly EntryKind[]

/** Types qu'une session ou un humain peut écrire : `system` est réservé au serveur. */
export type AuthoredEntryKind = Exclude<EntryKind, 'system'>
export const AUTHORED_ENTRY_KINDS = [
  'note',
  'decision',
  'question',
  'handoff',
  'status',
] as const satisfies readonly AuthoredEntryKind[]

export type SystemSource = 'claim' | 'hook' | 'lifecycle'
export const SYSTEM_SOURCES = [
  'claim',
  'hook',
  'lifecycle',
] as const satisfies readonly SystemSource[]

export interface SystemAuthor {
  readonly system: SystemSource
}

export type EntryAuthor = SessionRef | SystemAuthor

export function isSystemAuthor(author: EntryAuthor): author is SystemAuthor {
  return 'system' in author
}

export interface WorkspaceEntry {
  readonly workspaceId: string
  /** Monotone, sans trou, par workspace (à partir de 1). */
  readonly seq: number
  readonly kind: EntryKind
  readonly body: string
  readonly files: readonly string[]
  readonly author: EntryAuthor
  /** Nombre de secrets masqués par le scan. */
  readonly redactions: number
  /** Instruction suspecte détectée (conservée, mais signalée). Pas dans le modèle de la SPEC. */
  readonly suspicious: boolean
  readonly createdAt: string
}

export interface Claim {
  readonly id: string
  readonly workspaceId: string
  readonly repo: string
  /** Glob relatif à la racine du repo, ex. `apps/web/src/auth/**`. */
  readonly area: string
  readonly holder: SessionRef
  readonly acquiredAt: string
  readonly expiresAt: string
}

export interface Participant {
  readonly workspaceId: string
  readonly session: SessionRef
  readonly joinedAt: string
  readonly lastSeenAt: string
  /** Prochain `seq` à lire par cette session. */
  readonly cursor: number
}

// ── Vues renvoyées par l'API ─────────────────────────────────────────────────

export interface ParticipantView extends Participant {
  /** Manifestée depuis moins de 5 minutes. */
  readonly active: boolean
}

export type EntryCounts = Readonly<Record<EntryKind, number>>

export interface WorkspaceSummary {
  readonly workspace: Workspace
  readonly displayStatus: WorkspaceDisplayStatus
  readonly activeSessions: number
  readonly sessionCount: number
  readonly claimCount: number
}

export interface WorkspaceList {
  readonly items: readonly WorkspaceSummary[]
  readonly counts: { readonly open: number; readonly closed: number; readonly all: number }
}

export interface WorkspaceMember {
  readonly userId: string
  readonly name: string
  readonly role: 'creator' | 'member'
  readonly addedAt: string
}

/** Contexte lié, publié et visible de l'utilisateur. */
export interface LinkedContext {
  readonly id: string
  readonly slug: string
  readonly title: string
  readonly version: number
}

export interface WorkspaceDetail {
  readonly workspace: Workspace
  readonly displayStatus: WorkspaceDisplayStatus
  readonly createdByName: string
  readonly closedByName: string | null
  readonly members: readonly WorkspaceMember[]
  readonly participants: readonly ParticipantView[]
  /** Claims actifs (non expirés). */
  readonly claims: readonly Claim[]
  readonly linkedContexts: readonly LinkedContext[]
  readonly entryCount: number
  readonly entryCounts: EntryCounts
}

export interface EntryPage {
  readonly entries: readonly WorkspaceEntry[]
  readonly nextSeq: number
  readonly hasMore: boolean
}

export interface JoinResult {
  readonly workspace: Workspace
  readonly participant: ParticipantView
  readonly digest: string
  readonly cursor: number
}

export interface CheckWriteResult {
  readonly allowed: boolean
  readonly holder: SessionRef | null
  readonly claim: Claim | null
}

/** Delta injecté au prompt par le hook, et curseur qui le suit. */
export interface SyncResult {
  readonly text: string
  readonly count: number
  readonly nextSeq: number
  readonly remaining: number
}

export interface HeartbeatResult {
  readonly lastSeenAt: string
  readonly extendedClaims: number
}

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * MINUTE_MS

export const CLAIM_TTL_DEFAULT_MINUTES = 30
export const CLAIM_TTL_MAX_MINUTES = 240
export const WORKSPACE_INACTIVE_MS = 7 * DAY_MS
export const WORKSPACE_AUTO_CLOSE_MS = 30 * DAY_MS

export const ENTRY_MAX_LENGTH = 4_000
export const ENTRY_MAX_FILES = 20
export const WORKSPACE_TITLE_MAX_LENGTH = 120
export const WORKSPACE_GOAL_MAX_LENGTH = 500
export const WORKSPACE_MAX_REPOS = 10
export const WORKSPACE_MAX_LINKED_CONTEXTS = 10

/** Budget du résumé injecté au démarrage d'une session (≈ tokens). */
export const DIGEST_BUDGET_TOKENS = 1_500
/** Budget du delta injecté à chaque prompt (≈ tokens). */
export const DELTA_BUDGET_TOKENS = 800
/** Budget d'une lecture explicite (`workspace_read`). */
export const READ_BUDGET_TOKENS = 4_000

export const WORKSPACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const WORKSPACE_SLUG_MAX_LENGTH = 60

export const WORKSPACE_URI_SCHEME = 'workspace'

/** `workspace://{slug}` : le résumé d'un workspace (ressource MCP). */
export function workspaceUri(slug: string): string {
  return `${WORKSPACE_URI_SCHEME}://${slug}`
}

/** Commande du plugin Claude Code pour rejoindre un workspace. */
export function joinCommand(slug: string): string {
  return `/context-hub:join ${slug}`
}
