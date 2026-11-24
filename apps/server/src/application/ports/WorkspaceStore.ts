/**
 * Persistance des Workspaces. Les invariants de concurrence vivent ICI, dans une transaction
 * d'écriture verrouillée dès son début (IMMEDIATE en SQLite, `SELECT … FOR UPDATE` en Postgres) :
 * - `seq` attribué depuis `workspaces.next_seq` dans la transaction de l'insertion (sans trou) ;
 * - claims : purge des expirés, vérification du chevauchement et insertion dans une seule transaction.
 */
import type {
  Claim,
  EntryCounts,
  EntryKind,
  Participant,
  SystemSource,
  Workspace,
  WorkspaceEntry,
  WorkspaceMember,
} from '@context-hub/domain/workspaces/types.ts'

import type { UserId } from '../viewer.ts'

/** Une session qui écrit : utilisateur authentifié + label (+ repo). */
export interface SessionKey {
  readonly userId: UserId
  readonly sessionLabel: string
  readonly repo: string | null
}

/** Auteur d'une entrée à écrire (le nom de l'utilisateur est joint à la lecture). */
export type NewEntryAuthor = SessionKey | { readonly system: SystemSource }

/** Entrée à écrire, déjà scannée (secrets masqués). */
export interface NewEntry {
  readonly kind: EntryKind
  readonly body: string
  readonly files: readonly string[]
  readonly author: NewEntryAuthor
  readonly redactions: number
  readonly suspicious: boolean
}

export interface WorkspaceRecord {
  readonly workspace: Workspace
  readonly createdByName: string
  readonly closedByName: string | null
}

export interface WorkspaceListRow {
  readonly workspace: Workspace
  /** `lastSeenAt` de chaque participant (l'activité est dérivée avec l'horloge). */
  readonly participantsLastSeen: readonly string[]
  readonly activeClaimCount: number
}

export interface CreateWorkspaceWrite {
  readonly workspace: Workspace
  readonly creator: UserId
  /** Entrée `system/lifecycle` de création (#1). */
  readonly entry: NewEntry
}

export interface EntryQuery {
  /** Entrées de `seq` ≥ `since` (ordre croissant). */
  readonly since?: number
  /** Entrées de `seq` < `before`, les plus récentes d'abord retenues (rendues en ordre croissant). */
  readonly before?: number
  readonly limit: number
}

export interface EntrySlice {
  readonly entries: readonly WorkspaceEntry[]
  readonly hasMore: boolean
}

/** Activité d'une session qui accompagne une écriture : participant rafraîchi, claims prolongés. */
export interface SessionActivity {
  readonly session: SessionKey
  readonly at: Date
}

export type AppendResult =
  { readonly kind: 'appended'; readonly entry: WorkspaceEntry } | { readonly kind: 'closed' }

export interface AcquireClaimWrite {
  readonly workspaceId: string
  readonly id: string
  readonly session: SessionKey
  readonly repo: string
  readonly area: string
  readonly ttlMinutes: number
  readonly at: Date
  /** Entrée système annonçant la réservation. */
  readonly announce: (claim: Claim) => NewEntry
  /** Entrée système pour chaque claim expiré purgé au passage. */
  readonly expired: (claim: Claim) => NewEntry
}

export type AcquireClaimResult =
  /** `renewed` : la session tenait déjà exactement cette zone, son échéance est repoussée. */
  | { readonly kind: 'acquired' | 'renewed'; readonly claim: Claim }
  | { readonly kind: 'conflict'; readonly claim: Claim }
  | { readonly kind: 'closed' }

export interface ReleaseClaimWrite {
  readonly workspaceId: string
  readonly claimId: string
  /** Détenteur attendu ; null = libération forcée par un humain (UI). */
  readonly holder: SessionKey | null
  readonly at: Date
  readonly announce: (claim: Claim) => NewEntry
}

export type ReleaseClaimResult =
  | { readonly kind: 'released'; readonly claim: Claim; readonly entry: WorkspaceEntry }
  | { readonly kind: 'not-found' | 'not-holder' | 'closed' }

export interface TouchResult {
  readonly participant: Participant
  readonly extendedClaims: number
}

export interface WorkspaceStore {
  findBySlug(slug: string): Promise<WorkspaceRecord | null>
  isMember(workspaceId: string, userId: UserId): Promise<boolean>
  /** Identifiants des membres (pour les notifications). */
  memberIds(workspaceId: string): Promise<readonly UserId[]>
  listMembers(workspaceId: string): Promise<readonly WorkspaceMember[]>
  /** Workspaces dont l'utilisateur est membre, par dernière activité décroissante. */
  listForMember(userId: UserId, now: Date): Promise<readonly WorkspaceListRow[]>
  /** Nom de l'utilisateur, ou null s'il n'existe pas. */
  userName(userId: string): Promise<string | null>

  /** @returns false si le slug est déjà pris. */
  create(write: CreateWorkspaceWrite): Promise<boolean>
  /** Idempotent : un membre déjà présent garde son rôle. */
  addMember(workspaceId: string, userId: UserId, at: Date): Promise<void>
  /** Ferme (claims supprimés, entrée `lifecycle`) ; null s'il était déjà fermé. */
  close(
    workspaceId: string,
    by: UserId | null,
    at: Date,
    entry: NewEntry,
  ): Promise<WorkspaceEntry | null>
  /** Workspaces ouverts sans activité depuis `before` (fermeture automatique). */
  listIdleOpen(before: Date): Promise<readonly Workspace[]>

  /** Ajoute une entrée (seq attribué dans la transaction) ; refusée si le workspace est fermé. */
  appendEntry(
    workspaceId: string,
    entry: NewEntry,
    at: Date,
    activity: SessionActivity | null,
  ): Promise<AppendResult>
  readEntries(workspaceId: string, query: EntryQuery): Promise<EntrySlice>
  /** Dernières entrées d'un type (ou de tous), ordre croissant. */
  latestEntries(
    workspaceId: string,
    kind: EntryKind | null,
    limit: number,
  ): Promise<readonly WorkspaceEntry[]>
  entryCounts(workspaceId: string): Promise<EntryCounts>

  acquireClaim(write: AcquireClaimWrite): Promise<AcquireClaimResult>
  releaseClaim(write: ReleaseClaimWrite): Promise<ReleaseClaimResult>
  /** Claims non expirés à `now`. */
  activeClaims(workspaceId: string, now: Date): Promise<readonly Claim[]>
  /** Claims non expirés d'un repo, hors ceux de la session (pour `checkWrite`). */
  opposableClaims(
    workspaceId: string,
    repo: string,
    except: Pick<SessionKey, 'userId' | 'sessionLabel'>,
    now: Date,
  ): Promise<readonly Claim[]>
  /** Purge les claims expirés de tous les workspaces, avec une entrée système chacun. */
  purgeExpiredClaims(now: Date, expired: (claim: Claim) => NewEntry): Promise<number>

  /**
   * Crée ou rafraîchit le participant (`lastSeenAt`, repo, curseur s'il est fourni) et prolonge les
   * claims de la session.
   */
  touchParticipant(
    workspaceId: string,
    session: SessionKey,
    at: Date,
    cursor: number | null,
  ): Promise<TouchResult>
  participants(workspaceId: string): Promise<readonly Participant[]>
}
