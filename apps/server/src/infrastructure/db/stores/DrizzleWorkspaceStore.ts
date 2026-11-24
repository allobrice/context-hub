/**
 * Workspaces en SQLite (Drizzle). Toute écriture qui touche au journal ou aux claims est une
 * transaction IMMEDIATE : le verrou d'écriture est pris au BEGIN, avant toute lecture. Deux
 * connexions (processus, workers) ne peuvent donc pas lire le même `next_seq` ni le même état des
 * claims : la seconde attend (`busy_timeout`) puis lit l'état écrit par la première.
 * En Postgres, l'équivalent est un `SELECT … FOR UPDATE` sur la ligne `workspaces`.
 */
import { and, asc, count, desc, eq, gt, inArray, lt, lte, gte, ne, or } from 'drizzle-orm'

import { claimsOverlap, isSameSession } from '@context-hub/domain/workspaces/claims.ts'
import {
  ENTRY_KINDS,
  type Claim,
  type EntryAuthor,
  type EntryCounts,
  type EntryKind,
  type Participant,
  type SessionRef,
  type Workspace,
  type WorkspaceEntry,
  type WorkspaceMember,
} from '@context-hub/domain/workspaces/types.ts'
import { toContextId } from '@context-hub/domain/context/types.ts'

import type {
  AcquireClaimResult,
  AcquireClaimWrite,
  AppendResult,
  CreateWorkspaceWrite,
  EntryQuery,
  EntrySlice,
  NewEntry,
  ReleaseClaimResult,
  ReleaseClaimWrite,
  SessionActivity,
  SessionKey,
  TouchResult,
  WorkspaceListRow,
  WorkspaceRecord,
  WorkspaceStore,
} from '../../../application/ports/WorkspaceStore.ts'
import { toUserId, type UserId } from '../../../application/viewer.ts'
import type { AppDatabase, SyncDb } from '../connection.ts'
import { isoDate } from '../dates.ts'
import { deferred } from '../deferred.ts'
import {
  users,
  workspaceClaims,
  workspaceEntries,
  workspaceLinkedContexts,
  workspaceMembers,
  workspaceParticipants,
  workspaces,
} from '../schema.ts'

const IMMEDIATE = { behavior: 'immediate' } as const
const MINUTE_MS = 60 * 1000

type WorkspaceRow = typeof workspaces.$inferSelect
type EntryRow = typeof workspaceEntries.$inferSelect
type ClaimRow = typeof workspaceClaims.$inferSelect
type ParticipantRow = typeof workspaceParticipants.$inferSelect

function parseStrings(json: string): string[] {
  const value: unknown = JSON.parse(json)
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function plusMinutes(at: Date, minutes: number): string {
  return isoDate(new Date(at.getTime() + minutes * MINUTE_MS))
}

function toWorkspace(row: WorkspaceRow, linkedContextIds: readonly string[]): Workspace {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    goal: row.goal,
    status: row.status,
    repos: parseStrings(row.repos),
    linkedContextIds: linkedContextIds.map(toContextId),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    closedAt: row.closedAt,
  }
}

function sessionRef(
  userId: string,
  userName: string,
  sessionLabel: string,
  repo: string | null,
): SessionRef {
  return { userId, userName, sessionLabel, repo }
}

function toEntry(row: EntryRow, userName: string | null): WorkspaceEntry {
  const author: EntryAuthor =
    row.systemSource !== null
      ? { system: row.systemSource }
      : sessionRef(
          row.authorUserId ?? '',
          userName ?? row.authorUserId ?? '',
          row.authorSessionLabel ?? '',
          row.authorRepo,
        )
  return {
    workspaceId: row.workspaceId,
    seq: row.seq,
    kind: row.kind,
    body: row.body,
    files: parseStrings(row.files),
    author,
    redactions: row.redactions,
    suspicious: row.suspicious,
    createdAt: row.createdAt,
  }
}

function toClaim(row: ClaimRow, userName: string): Claim {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    repo: row.repo,
    area: row.area,
    holder: sessionRef(row.holderUserId, userName, row.holderSessionLabel, row.holderRepo),
    acquiredAt: row.acquiredAt,
    expiresAt: row.expiresAt,
  }
}

function toParticipant(row: ParticipantRow, userName: string): Participant {
  return {
    workspaceId: row.workspaceId,
    session: sessionRef(row.userId, userName, row.sessionLabel, row.repo),
    joinedAt: row.joinedAt,
    lastSeenAt: row.lastSeenAt,
    cursor: row.cursor,
  }
}

function userNameIn(db: SyncDb, userId: string): string | null {
  return db.select({ name: users.name }).from(users).where(eq(users.id, userId)).get()?.name ?? null
}

function linkedContextIdsIn(db: SyncDb, workspaceId: string): string[] {
  return db
    .select({ contextId: workspaceLinkedContexts.contextId })
    .from(workspaceLinkedContexts)
    .where(eq(workspaceLinkedContexts.workspaceId, workspaceId))
    .orderBy(asc(workspaceLinkedContexts.position))
    .all()
    .map((row) => row.contextId)
}

function isSessionAuthor(author: NewEntry['author']): author is SessionKey {
  return !('system' in author)
}

/**
 * Ajoute une entrée DANS la transaction en cours : `seq` = `next_seq`, puis `next_seq + 1`.
 * L'appelant a ouvert une transaction IMMEDIATE (verrou d'écriture tenu jusqu'au COMMIT).
 */
function appendIn(tx: SyncDb, workspaceId: string, entry: NewEntry, at: Date): WorkspaceEntry {
  const workspace = tx
    .select({ nextSeq: workspaces.nextSeq })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .get()
  if (!workspace) throw new Error('Workspace inexistant')
  const seq = workspace.nextSeq
  const createdAt = isoDate(at)
  const session = isSessionAuthor(entry.author) ? entry.author : null
  const row = {
    workspaceId,
    seq,
    kind: entry.kind,
    body: entry.body,
    files: JSON.stringify(entry.files),
    authorUserId: session?.userId ?? null,
    authorSessionLabel: session?.sessionLabel ?? null,
    authorRepo: session?.repo ?? null,
    systemSource: 'system' in entry.author ? entry.author.system : null,
    redactions: entry.redactions,
    suspicious: entry.suspicious,
    createdAt,
  }
  tx.insert(workspaceEntries).values(row).run()
  tx.update(workspaces)
    .set({ nextSeq: seq + 1, lastActivityAt: createdAt })
    .where(eq(workspaces.id, workspaceId))
    .run()
  return toEntry(row, session ? userNameIn(tx, session.userId) : null)
}

function sessionClaimsCondition(
  workspaceId: string,
  session: Pick<SessionKey, 'userId' | 'sessionLabel'>,
) {
  return and(
    eq(workspaceClaims.workspaceId, workspaceId),
    eq(workspaceClaims.holderUserId, session.userId),
    eq(workspaceClaims.holderSessionLabel, session.sessionLabel),
  )
}

/** Prolonge les claims non expirés de la session (échéance = maintenant + leur TTL). */
function extendSessionClaimsIn(
  tx: SyncDb,
  workspaceId: string,
  session: SessionKey,
  at: Date,
): number {
  const claims = tx
    .select()
    .from(workspaceClaims)
    .where(
      and(sessionClaimsCondition(workspaceId, session), gt(workspaceClaims.expiresAt, isoDate(at))),
    )
    .all()
  for (const claim of claims) {
    tx.update(workspaceClaims)
      .set({ expiresAt: plusMinutes(at, claim.ttlMinutes) })
      .where(eq(workspaceClaims.id, claim.id))
      .run()
  }
  return claims.length
}

function touchIn(
  tx: SyncDb,
  workspaceId: string,
  session: SessionKey,
  at: Date,
  cursor: number | null,
): TouchResult {
  const now = isoDate(at)
  const key = and(
    eq(workspaceParticipants.workspaceId, workspaceId),
    eq(workspaceParticipants.userId, session.userId),
    eq(workspaceParticipants.sessionLabel, session.sessionLabel),
  )
  const existing = tx.select().from(workspaceParticipants).where(key).get()
  if (existing) {
    tx.update(workspaceParticipants)
      .set({
        lastSeenAt: now,
        repo: session.repo ?? existing.repo,
        // Le curseur n'avance que : une requête en retard ne fait pas relire des entrées déjà vues.
        cursor: cursor === null ? existing.cursor : Math.max(existing.cursor, cursor),
      })
      .where(key)
      .run()
  } else {
    tx.insert(workspaceParticipants)
      .values({
        workspaceId,
        userId: session.userId,
        sessionLabel: session.sessionLabel,
        repo: session.repo,
        joinedAt: now,
        lastSeenAt: now,
        cursor: cursor ?? 1,
      })
      .run()
  }
  const row = tx.select().from(workspaceParticipants).where(key).get()
  if (!row) throw new Error('Participant introuvable après écriture')
  return {
    participant: toParticipant(row, userNameIn(tx, session.userId) ?? session.userId),
    extendedClaims: extendSessionClaimsIn(tx, workspaceId, session, at),
  }
}

function claimsWithNames(db: SyncDb, condition: ReturnType<typeof and>): Claim[] {
  return db
    .select({ claim: workspaceClaims, name: users.name })
    .from(workspaceClaims)
    .innerJoin(users, eq(users.id, workspaceClaims.holderUserId))
    .where(condition)
    .orderBy(asc(workspaceClaims.acquiredAt), asc(workspaceClaims.id))
    .all()
    .map(({ claim, name }) => toClaim(claim, name))
}

/** Supprime les claims expirés d'un workspace (ou de tous), une entrée système pour chacun. */
function purgeExpiredIn(
  tx: SyncDb,
  workspaceId: string | null,
  at: Date,
  expired: (claim: Claim) => NewEntry,
): number {
  const now = isoDate(at)
  const condition =
    workspaceId === null
      ? lte(workspaceClaims.expiresAt, now)
      : and(eq(workspaceClaims.workspaceId, workspaceId), lte(workspaceClaims.expiresAt, now))
  const claims = claimsWithNames(tx, condition)
  for (const claim of claims) {
    tx.delete(workspaceClaims).where(eq(workspaceClaims.id, claim.id)).run()
    appendIn(tx, claim.workspaceId, expired(claim), at)
  }
  return claims.length
}

function isOpenIn(tx: SyncDb, workspaceId: string): boolean {
  return (
    tx
      .select({ status: workspaces.status })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .get()?.status === 'open'
  )
}

export class DrizzleWorkspaceStore implements WorkspaceStore {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  findBySlug(slug: string): Promise<WorkspaceRecord | null> {
    return deferred(() => {
      const row = this.db
        .select({ workspace: workspaces, createdByName: users.name })
        .from(workspaces)
        .innerJoin(users, eq(users.id, workspaces.createdBy))
        .where(eq(workspaces.slug, slug))
        .get()
      if (!row) return null
      return {
        workspace: toWorkspace(row.workspace, linkedContextIdsIn(this.db, row.workspace.id)),
        createdByName: row.createdByName,
        closedByName:
          row.workspace.closedBy === null ? null : userNameIn(this.db, row.workspace.closedBy),
      }
    })
  }

  isMember(workspaceId: string, userId: UserId): Promise<boolean> {
    return deferred(
      () =>
        this.db
          .select({ userId: workspaceMembers.userId })
          .from(workspaceMembers)
          .where(
            and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
          )
          .get() !== undefined,
    )
  }

  memberIds(workspaceId: string): Promise<readonly UserId[]> {
    return deferred(() =>
      this.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .all()
        .map((row) => toUserId(row.userId)),
    )
  }

  listMembers(workspaceId: string): Promise<readonly WorkspaceMember[]> {
    return deferred(() =>
      this.db
        .select({ member: workspaceMembers, name: users.name })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(eq(workspaceMembers.workspaceId, workspaceId))
        .orderBy(asc(workspaceMembers.addedAt), asc(workspaceMembers.userId))
        .all()
        .map(({ member, name }) => ({
          userId: member.userId,
          name,
          role: member.role,
          addedAt: member.addedAt,
        })),
    )
  }

  listForMember(userId: UserId, now: Date): Promise<readonly WorkspaceListRow[]> {
    return deferred(() => {
      const rows = this.db
        .select({ workspace: workspaces })
        .from(workspaces)
        .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(eq(workspaceMembers.userId, userId))
        .orderBy(desc(workspaces.lastActivityAt), asc(workspaces.slug))
        .all()
      const ids = rows.map((row) => row.workspace.id)
      if (ids.length === 0) return []
      const lastSeen = new Map<string, string[]>()
      for (const participant of this.db
        .select({
          workspaceId: workspaceParticipants.workspaceId,
          lastSeenAt: workspaceParticipants.lastSeenAt,
        })
        .from(workspaceParticipants)
        .where(inArray(workspaceParticipants.workspaceId, ids))
        .all()) {
        lastSeen.set(participant.workspaceId, [
          ...(lastSeen.get(participant.workspaceId) ?? []),
          participant.lastSeenAt,
        ])
      }
      const claimCounts = new Map(
        this.db
          .select({ workspaceId: workspaceClaims.workspaceId, total: count() })
          .from(workspaceClaims)
          .where(
            and(
              inArray(workspaceClaims.workspaceId, ids),
              gt(workspaceClaims.expiresAt, isoDate(now)),
            ),
          )
          .groupBy(workspaceClaims.workspaceId)
          .all()
          .map((row) => [row.workspaceId, row.total]),
      )
      const linked = new Map<string, string[]>()
      for (const link of this.db
        .select()
        .from(workspaceLinkedContexts)
        .where(inArray(workspaceLinkedContexts.workspaceId, ids))
        .orderBy(asc(workspaceLinkedContexts.position))
        .all()) {
        linked.set(link.workspaceId, [...(linked.get(link.workspaceId) ?? []), link.contextId])
      }
      return rows.map(({ workspace }) => ({
        workspace: toWorkspace(workspace, linked.get(workspace.id) ?? []),
        participantsLastSeen: lastSeen.get(workspace.id) ?? [],
        activeClaimCount: claimCounts.get(workspace.id) ?? 0,
      }))
    })
  }

  userName(userId: string): Promise<string | null> {
    return deferred(() => userNameIn(this.db, userId))
  }

  create({ workspace, creator, entry }: CreateWorkspaceWrite): Promise<boolean> {
    return deferred(() =>
      this.db.transaction((tx) => {
        const taken = tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.slug, workspace.slug))
          .get()
        if (taken) return false
        tx.insert(workspaces)
          .values({
            id: workspace.id,
            slug: workspace.slug,
            title: workspace.title,
            goal: workspace.goal,
            status: 'open',
            repos: JSON.stringify(workspace.repos),
            createdBy: workspace.createdBy,
            createdAt: workspace.createdAt,
            lastActivityAt: workspace.lastActivityAt,
            closedAt: null,
            closedBy: null,
            nextSeq: 1,
          })
          .run()
        tx.insert(workspaceMembers)
          .values({
            workspaceId: workspace.id,
            userId: creator,
            role: 'creator',
            addedAt: workspace.createdAt,
          })
          .run()
        workspace.linkedContextIds.forEach((contextId, position) => {
          tx.insert(workspaceLinkedContexts)
            .values({ workspaceId: workspace.id, contextId, position })
            .run()
        })
        appendIn(tx, workspace.id, entry, new Date(workspace.createdAt))
        return true
      }, IMMEDIATE),
    )
  }

  addMember(workspaceId: string, userId: UserId, at: Date): Promise<void> {
    return deferred(() => {
      this.db
        .insert(workspaceMembers)
        .values({ workspaceId, userId, role: 'member', addedAt: isoDate(at) })
        .onConflictDoNothing()
        .run()
    })
  }

  close(
    workspaceId: string,
    by: UserId | null,
    at: Date,
    entry: NewEntry,
  ): Promise<WorkspaceEntry | null> {
    return deferred(() =>
      this.db.transaction((tx) => {
        if (!isOpenIn(tx, workspaceId)) return null
        const appended = appendIn(tx, workspaceId, entry, at)
        tx.delete(workspaceClaims).where(eq(workspaceClaims.workspaceId, workspaceId)).run()
        tx.update(workspaces)
          .set({ status: 'closed', closedAt: isoDate(at), closedBy: by })
          .where(eq(workspaces.id, workspaceId))
          .run()
        return appended
      }, IMMEDIATE),
    )
  }

  listIdleOpen(before: Date): Promise<readonly Workspace[]> {
    return deferred(() =>
      this.db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.status, 'open'), lte(workspaces.lastActivityAt, isoDate(before))))
        .all()
        .map((row) => toWorkspace(row, [])),
    )
  }

  appendEntry(
    workspaceId: string,
    entry: NewEntry,
    at: Date,
    activity: SessionActivity | null,
  ): Promise<AppendResult> {
    return deferred(() =>
      this.db.transaction((tx): AppendResult => {
        if (!isOpenIn(tx, workspaceId)) return { kind: 'closed' }
        const appended = appendIn(tx, workspaceId, entry, at)
        if (activity) touchIn(tx, workspaceId, activity.session, activity.at, null)
        return { kind: 'appended', entry: appended }
      }, IMMEDIATE),
    )
  }

  readEntries(workspaceId: string, { since, before, limit }: EntryQuery): Promise<EntrySlice> {
    return deferred(() => {
      const base = this.db
        .select({ entry: workspaceEntries, name: users.name })
        .from(workspaceEntries)
        .leftJoin(users, eq(users.id, workspaceEntries.authorUserId))
      const rows =
        before === undefined
          ? base
              .where(
                and(
                  eq(workspaceEntries.workspaceId, workspaceId),
                  gte(workspaceEntries.seq, since ?? 1),
                ),
              )
              .orderBy(asc(workspaceEntries.seq))
              .limit(limit + 1)
              .all()
          : base
              .where(
                and(
                  eq(workspaceEntries.workspaceId, workspaceId),
                  lt(workspaceEntries.seq, before),
                ),
              )
              .orderBy(desc(workspaceEntries.seq))
              .limit(limit + 1)
              .all()
              .reverse()
      const hasMore = rows.length > limit
      const kept =
        before === undefined ? rows.slice(0, limit) : rows.slice(Math.max(0, rows.length - limit))
      return { entries: kept.map(({ entry, name }) => toEntry(entry, name)), hasMore }
    })
  }

  latestEntries(
    workspaceId: string,
    kind: EntryKind | null,
    limit: number,
  ): Promise<readonly WorkspaceEntry[]> {
    return deferred(() =>
      this.db
        .select({ entry: workspaceEntries, name: users.name })
        .from(workspaceEntries)
        .leftJoin(users, eq(users.id, workspaceEntries.authorUserId))
        .where(
          kind === null
            ? eq(workspaceEntries.workspaceId, workspaceId)
            : and(eq(workspaceEntries.workspaceId, workspaceId), eq(workspaceEntries.kind, kind)),
        )
        .orderBy(desc(workspaceEntries.seq))
        .limit(limit)
        .all()
        .reverse()
        .map(({ entry, name }) => toEntry(entry, name)),
    )
  }

  entryCounts(workspaceId: string): Promise<EntryCounts> {
    return deferred(() => {
      const totals = new Map(
        this.db
          .select({ kind: workspaceEntries.kind, total: count() })
          .from(workspaceEntries)
          .where(eq(workspaceEntries.workspaceId, workspaceId))
          .groupBy(workspaceEntries.kind)
          .all()
          .map((row) => [row.kind, row.total]),
      )
      const counts: Record<EntryKind, number> = {
        note: 0,
        decision: 0,
        question: 0,
        handoff: 0,
        status: 0,
        system: 0,
      }
      for (const kind of ENTRY_KINDS) counts[kind] = totals.get(kind) ?? 0
      return counts
    })
  }

  acquireClaim(write: AcquireClaimWrite): Promise<AcquireClaimResult> {
    const { workspaceId, session, repo, area, ttlMinutes, at } = write
    return deferred(() =>
      this.db.transaction((tx): AcquireClaimResult => {
        if (!isOpenIn(tx, workspaceId)) return { kind: 'closed' }
        purgeExpiredIn(tx, workspaceId, at, write.expired)
        const active = claimsWithNames(
          tx,
          and(eq(workspaceClaims.workspaceId, workspaceId), eq(workspaceClaims.repo, repo)),
        )
        const own = active.find(
          (claim) => isSameSession(claim.holder, session) && claim.area === area,
        )
        if (own) {
          const expiresAt = plusMinutes(at, ttlMinutes)
          tx.update(workspaceClaims)
            .set({ expiresAt, ttlMinutes })
            .where(eq(workspaceClaims.id, own.id))
            .run()
          return { kind: 'renewed', claim: { ...own, expiresAt } }
        }
        const conflict = active.find(
          (claim) => !isSameSession(claim.holder, session) && claimsOverlap(claim, { repo, area }),
        )
        if (conflict) return { kind: 'conflict', claim: conflict }
        const row = {
          id: write.id,
          workspaceId,
          repo,
          area,
          holderUserId: session.userId,
          holderSessionLabel: session.sessionLabel,
          holderRepo: session.repo,
          acquiredAt: isoDate(at),
          expiresAt: plusMinutes(at, ttlMinutes),
          ttlMinutes,
        }
        tx.insert(workspaceClaims).values(row).run()
        const claim = toClaim(row, userNameIn(tx, session.userId) ?? session.userId)
        appendIn(tx, workspaceId, write.announce(claim), at)
        return { kind: 'acquired', claim }
      }, IMMEDIATE),
    )
  }

  releaseClaim({
    workspaceId,
    claimId,
    holder,
    at,
    announce,
  }: ReleaseClaimWrite): Promise<ReleaseClaimResult> {
    return deferred(() =>
      this.db.transaction((tx): ReleaseClaimResult => {
        if (!isOpenIn(tx, workspaceId)) return { kind: 'closed' }
        const [claim] = claimsWithNames(
          tx,
          and(eq(workspaceClaims.workspaceId, workspaceId), eq(workspaceClaims.id, claimId)),
        )
        if (!claim) return { kind: 'not-found' }
        if (holder !== null && !isSameSession(claim.holder, holder)) return { kind: 'not-holder' }
        tx.delete(workspaceClaims).where(eq(workspaceClaims.id, claimId)).run()
        return { kind: 'released', claim, entry: appendIn(tx, workspaceId, announce(claim), at) }
      }, IMMEDIATE),
    )
  }

  activeClaims(workspaceId: string, now: Date): Promise<readonly Claim[]> {
    return deferred(() =>
      claimsWithNames(
        this.db,
        and(
          eq(workspaceClaims.workspaceId, workspaceId),
          gt(workspaceClaims.expiresAt, isoDate(now)),
        ),
      ),
    )
  }

  opposableClaims(
    workspaceId: string,
    repo: string,
    except: Pick<SessionKey, 'userId' | 'sessionLabel'>,
    now: Date,
  ): Promise<readonly Claim[]> {
    return deferred(() =>
      claimsWithNames(
        this.db,
        and(
          eq(workspaceClaims.workspaceId, workspaceId),
          eq(workspaceClaims.repo, repo),
          gt(workspaceClaims.expiresAt, isoDate(now)),
          or(
            ne(workspaceClaims.holderUserId, except.userId),
            ne(workspaceClaims.holderSessionLabel, except.sessionLabel),
          ),
        ),
      ),
    )
  }

  purgeExpiredClaims(now: Date, expired: (claim: Claim) => NewEntry): Promise<number> {
    return deferred(() =>
      this.db.transaction((tx) => purgeExpiredIn(tx, null, now, expired), IMMEDIATE),
    )
  }

  touchParticipant(
    workspaceId: string,
    session: SessionKey,
    at: Date,
    cursor: number | null,
  ): Promise<TouchResult> {
    return deferred(() =>
      this.db.transaction((tx) => touchIn(tx, workspaceId, session, at, cursor), IMMEDIATE),
    )
  }

  participants(workspaceId: string): Promise<readonly Participant[]> {
    return deferred(() =>
      this.db
        .select({ participant: workspaceParticipants, name: users.name })
        .from(workspaceParticipants)
        .innerJoin(users, eq(users.id, workspaceParticipants.userId))
        .where(eq(workspaceParticipants.workspaceId, workspaceId))
        .orderBy(desc(workspaceParticipants.lastSeenAt), asc(workspaceParticipants.sessionLabel))
        .all()
        .map(({ participant, name }) => toParticipant(participant, name)),
    )
  }
}
