/**
 * Missions en SQLite (Drizzle). Toute écriture est une transaction IMMEDIATE : le verrou d'écriture
 * est pris au BEGIN, avant la lecture de la mission. Deux connexions ne peuvent donc pas lire la même
 * mission `ready` puis la prendre chacune : la seconde attend (`busy_timeout`), puis lit la mission
 * déjà `in_progress` et la `transition` du domaine la refuse.
 */
import { and, asc, eq, exists, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'

import { toContextId } from '@context-hub/domain/context/types.ts'
import {
  renewClaim,
  transition,
  type MissionCommand,
  type Transition,
} from '@context-hub/domain/missions/lifecycle.ts'
import type {
  DraftMission,
  Mission,
  MissionActor,
  Freshness,
  MissionClaim,
  MissionCore,
  MissionEvent,
  MissionEventActor,
  ReadyMission,
  Validation,
} from '@context-hub/domain/missions/types.ts'
import { MissionResultSchema } from '@context-hub/domain/schemas/missions.ts'
import { isSameSession, type SessionRef } from '@context-hub/domain/sessions/session.ts'

import type {
  ApplyResult,
  ApplyWrite,
  MissionStore,
  RenewResult,
  RenewWrite,
  SweepResult,
  TakeResult,
  TakeWrite,
} from '../../../application/ports/MissionStore.ts'
import type { Viewer } from '../../../application/viewer.ts'
import type { AppDatabase, SyncDb } from '../connection.ts'
import { isoDate } from '../dates.ts'
import { deferred } from '../deferred.ts'
import { missionEvents, missions, missionTags } from '../schema.ts'
import { IMMEDIATE } from '../transactions.ts'
import { scopeColumns, scopeOf, visibleIn } from './scopeRecords.ts'
import { userNamesIn } from './userRecords.ts'

type MissionRow = typeof missions.$inferSelect
type EventRow = typeof missionEvents.$inferSelect
type Names = ReadonlyMap<string, string>

const JOB: MissionActor = { kind: 'job' }
const StringListSchema = z.array(z.string())

// ── Lecture : ligne → domaine ────────────────────────────────────────────────

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const value: unknown = JSON.parse(text)
  return schema.parse(value)
}

/** Colonne obligatoire pour ce statut : son absence est une incohérence de la base. */
function required<T>(value: T | null, column: string, row: MissionRow): T {
  if (value === null) throw new Error(`Mission ${row.id} incohérente : ${column} manquant`)
  return value
}

function sessionOf(
  names: Names,
  userId: string | null,
  sessionLabel: string | null,
  repo: string | null,
): SessionRef | null {
  if (userId === null || sessionLabel === null) return null
  return { userId, userName: names.get(userId) ?? userId, sessionLabel, repo }
}

function claimOf(row: MissionRow, names: Names): MissionClaim {
  const userId = required(row.claimUserId, 'claim_user_id', row)
  return {
    session: {
      userId,
      userName: names.get(userId) ?? userId,
      sessionLabel: required(row.claimSessionLabel, 'claim_session_label', row),
      repo: row.claimRepo,
    },
    acquiredAt: required(row.claimAcquiredAt, 'claim_acquired_at', row),
    expiresAt: required(row.claimExpiresAt, 'claim_expires_at', row),
  }
}

/** Fraîcheur : absente si jamais rapportée ; une ligne à moitié remplie est une incohérence. */
function freshnessOf(row: MissionRow, names: Names): Freshness | null {
  if (row.freshnessCheckedAt === null) return null
  const userId = required(row.freshnessUserId, 'freshness_user_id', row)
  return {
    checkedAt: row.freshnessCheckedAt,
    changedFiles: parseJson(
      required(row.freshnessChangedFiles, 'freshness_changed_files', row),
      StringListSchema,
    ),
    checkedBy: {
      userId,
      userName: names.get(userId) ?? userId,
      sessionLabel: required(row.freshnessSessionLabel, 'freshness_session_label', row),
      repo: row.freshnessRepo,
    },
  }
}

/** Validation : absente tant qu'aucun humain n'a validé ; à moitié remplie, une incohérence. */
function validationOf(row: MissionRow): Validation | null {
  if (row.validationBy === null) return null
  return { by: row.validationBy, at: required(row.validationAt, 'validation_at', row) }
}

function coreOf(row: MissionRow, tags: readonly string[], names: Names): MissionCore {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    prompt: row.prompt,
    priority: row.priority,
    tags,
    scope: scopeOf(row.scopeKind, row.scopeValue),
    origin: {
      label: row.originLabel,
      batchId: row.originBatchId,
      session: sessionOf(names, row.originUserId, row.originSessionLabel, row.originRepo),
      createdBy: row.createdBy,
    },
    codeRef: {
      repo: row.codeRefRepo,
      commit: row.codeRefCommit,
      files: parseJson(row.codeRefFiles, StringListSchema),
    },
    freshness: freshnessOf(row, names),
    linkedContextIds: parseJson(row.linkedContextIds, StringListSchema).map(toContextId),
    workspaceId: row.workspaceId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  }
}

function toMission(row: MissionRow, tags: readonly string[], names: Names): Mission {
  const core = coreOf(row, tags, names)
  const validation = validationOf(row)
  const open = { claim: null, result: null, dropReason: null, closedAt: null } as const
  switch (row.status) {
    case 'draft':
      return { ...core, ...open, status: 'draft', validation: null }
    case 'ready':
      return { ...core, ...open, status: 'ready', validation }
    case 'in_progress':
      return { ...core, ...open, status: 'in_progress', validation, claim: claimOf(row, names) }
    case 'done':
      return {
        ...core,
        ...open,
        status: 'done',
        validation,
        result: parseJson(required(row.result, 'result', row), MissionResultSchema),
        closedAt: required(row.closedAt, 'closed_at', row),
      }
    case 'dropped':
      return {
        ...core,
        ...open,
        status: 'dropped',
        validation,
        dropReason: required(row.dropReason, 'drop_reason', row),
        closedAt: required(row.closedAt, 'closed_at', row),
      }
    case 'expired':
      return {
        ...core,
        ...open,
        status: 'expired',
        validation,
        closedAt: required(row.closedAt, 'closed_at', row),
      }
  }
}

function toEvent(row: EventRow, names: Names): MissionEvent {
  return {
    missionId: row.missionId,
    missionSlug: row.missionSlug,
    missionTitle: row.missionTitle,
    at: row.at,
    actor: eventActorFromRow(row, names),
    type: row.type,
    detail: row.detail,
  }
}

function eventActorFromRow(row: EventRow, names: Names): MissionEventActor {
  if (row.actorSystem !== null || row.actorUserId === null) return { system: 'job' }
  return (
    sessionOf(names, row.actorUserId, row.actorSessionLabel, row.actorRepo) ?? {
      userId: row.actorUserId,
    }
  )
}

function tagsIn(db: SyncDb, missionId: string): string[] {
  return db
    .select({ tag: missionTags.tag })
    .from(missionTags)
    .where(eq(missionTags.missionId, missionId))
    .orderBy(asc(missionTags.position))
    .all()
    .map((row) => row.tag)
}

function load(db: SyncDb, row: MissionRow): Mission {
  const names = userNamesIn(db, [
    row.originUserId,
    row.freshnessUserId,
    row.claimUserId,
  ])
  return toMission(row, tagsIn(db, row.id), names)
}

// ── Écriture : domaine → ligne ───────────────────────────────────────────────

/** Colonnes qui changent au fil du cycle de vie (tout sauf l'identité et le jeton). */
function lifecycleColumns(mission: Mission) {
  const { claim, freshness, validation } = mission
  return {
    status: mission.status,
    expiresAt: mission.expiresAt,
    updatedAt: mission.updatedAt,
    closedAt: mission.closedAt,
    validationBy: validation?.by ?? null,
    validationAt: validation?.at ?? null,
    claimUserId: claim?.session.userId ?? null,
    claimSessionLabel: claim?.session.sessionLabel ?? null,
    claimRepo: claim?.session.repo ?? null,
    claimAcquiredAt: claim?.acquiredAt ?? null,
    claimExpiresAt: claim?.expiresAt ?? null,
    freshnessCheckedAt: freshness?.checkedAt ?? null,
    freshnessChangedFiles: freshness === null ? null : JSON.stringify(freshness.changedFiles),
    freshnessUserId: freshness?.checkedBy.userId ?? null,
    freshnessSessionLabel: freshness?.checkedBy.sessionLabel ?? null,
    freshnessRepo: freshness?.checkedBy.repo ?? null,
    result: mission.result === null ? null : JSON.stringify(mission.result),
    dropReason: mission.dropReason,
  }
}

function insertRow(mission: DraftMission | ReadyMission): typeof missions.$inferInsert {
  const { scopeKind, scopeValue } = scopeColumns(mission.scope)
  return {
    ...lifecycleColumns(mission),
    id: mission.id,
    slug: mission.slug,
    title: mission.title,
    summary: mission.summary,
    prompt: mission.prompt,
    priority: mission.priority,
    scopeKind,
    scopeValue,
    originLabel: mission.origin.label,
    originBatchId: mission.origin.batchId,
    originUserId: mission.origin.session?.userId ?? null,
    originSessionLabel: mission.origin.session?.sessionLabel ?? null,
    originRepo: mission.origin.session?.repo ?? null,
    createdBy: mission.origin.createdBy,
    codeRefRepo: mission.codeRef.repo,
    codeRefCommit: mission.codeRef.commit,
    codeRefFiles: JSON.stringify(mission.codeRef.files),
    linkedContextIds: JSON.stringify(mission.linkedContextIds),
    workspaceId: mission.workspaceId,
    createdAt: mission.createdAt,
    claimTokenHash: null,
  }
}

function appendEvent(db: SyncDb, event: MissionEvent): void {
  const { actor } = event
  // `MissionEventActor` n'a pas de discriminant : session = a un label, humain = `userId` seul,
  // job = `system`. À revoir si une variante gagne l'un de ces champs.
  const session = 'sessionLabel' in actor ? actor : null
  db.insert(missionEvents)
    .values({
      missionId: event.missionId,
      missionSlug: event.missionSlug,
      missionTitle: event.missionTitle,
      at: event.at,
      type: event.type,
      actorUserId: 'userId' in actor ? actor.userId : null,
      actorSessionLabel: session?.sessionLabel ?? null,
      actorRepo: session?.repo ?? null,
      actorSystem: 'system' in actor ? actor.system : null,
      detail: event.detail,
    })
    .run()
}

/**
 * Écrit le résultat d'une transition : mission mise à jour (ou supprimée, pour un rejet) et son
 * événement. Jeton de réservation : `tokenHash` le remplace (prise) ; sans réservation il est effacé ;
 * sinon (fraîcheur) il est conservé.
 */
function persist(db: SyncDb, result: Transition, tokenHash?: string): void {
  if (result.kind === 'deleted') {
    db.delete(missions).where(eq(missions.id, result.event.missionId)).run()
  } else {
    const { mission } = result
    db.update(missions)
      .set({
        ...lifecycleColumns(mission),
        ...tokenColumn(mission, tokenHash),
      })
      .where(eq(missions.id, mission.id))
      .run()
  }
  appendEvent(db, result.event)
}

function tokenColumn(mission: Mission, tokenHash: string | undefined) {
  if (mission.claim === null) return { claimTokenHash: null }
  return tokenHash === undefined ? {} : { claimTokenHash: tokenHash }
}

// ── Requêtes ─────────────────────────────────────────────────────────────────

function visibleTo(viewer: Viewer): SQL {
  return visibleIn({ kind: missions.scopeKind, value: missions.scopeValue }, viewer)
}

function findVisibleIn(db: SyncDb, viewer: Viewer, slug: string): MissionRow | undefined {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.slug, slug), visibleTo(viewer)))
    .get()
}

/** La prochaine mission prête : la plus prioritaire, puis la plus ancienne, qui porte tous les tags. */
function nextReadyIn(
  db: SyncDb,
  viewer: Viewer,
  filters: { readonly tags: readonly string[]; readonly repo: string | null },
): MissionRow | undefined {
  const tagged = filters.tags.map((tag) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(missionTags)
        .where(and(eq(missionTags.missionId, missions.id), eq(missionTags.tag, tag))),
    ),
  )
  return db
    .select()
    .from(missions)
    .where(
      and(
        eq(missions.status, 'ready'),
        visibleTo(viewer),
        filters.repo === null ? undefined : eq(missions.codeRefRepo, filters.repo),
        ...tagged,
      ),
    )
    .orderBy(asc(missions.priority), asc(missions.createdAt), asc(missions.id))
    .get()
}

/**
 * Balaye l'échu, dans la transaction en cours : réservations expirées libérées, puis missions non
 * prises arrivées à échéance expirées. Chaque changement passe par `transition` (acteur : le job).
 */
function sweepIn(db: SyncDb, now: Date): SweepResult {
  const at = isoDate(now)
  const apply = (rows: readonly MissionRow[], command: MissionCommand): number => {
    let applied = 0
    for (const row of rows) {
      const result = transition(load(db, row), command, JOB, now)
      // La requête et `transition` comparent l'échéance de la même façon (`<=`) : un refus ici
      // signalerait une divergence entre les deux, sans raison de bloquer la prise en cours.
      if (!result.ok) continue
      persist(db, result.value)
      applied += 1
    }
    return applied
  }
  const released = apply(
    db
      .select()
      .from(missions)
      .where(and(eq(missions.status, 'in_progress'), lte(missions.claimExpiresAt, at)))
      .all(),
    { type: 'expireClaim' },
  )
  const expired = apply(
    db
      .select()
      .from(missions)
      .where(and(inArray(missions.status, ['draft', 'ready']), lte(missions.expiresAt, at)))
      .all(),
    { type: 'expire' },
  )
  return { expired, released }
}

/** La session détentrice d'une mission en cours doit présenter le jeton remis à la prise. */
function holdsToken(row: MissionRow, mission: Mission, actor: MissionActor, hash: string | null) {
  if (actor.kind !== 'session' || mission.status !== 'in_progress') return true
  if (!isSameSession(mission.claim.session, actor.session)) return true
  return hash !== null && row.claimTokenHash === hash
}

// ── Store ────────────────────────────────────────────────────────────────────

export class DrizzleMissionStore implements MissionStore {
  private readonly db: AppDatabase

  constructor(db: AppDatabase) {
    this.db = db
  }

  create(mission: DraftMission | ReadyMission, event: MissionEvent): Promise<boolean> {
    return deferred(() =>
      this.db.transaction((tx) => {
        const taken = tx
          .select({ id: missions.id })
          .from(missions)
          .where(eq(missions.slug, mission.slug))
          .get()
        if (taken !== undefined) return false
        tx.insert(missions).values(insertRow(mission)).run()
        if (mission.tags.length > 0) {
          tx.insert(missionTags)
            .values(mission.tags.map((tag, position) => ({ missionId: mission.id, tag, position })))
            .run()
        }
        appendEvent(tx, event)
        return true
      }, IMMEDIATE),
    )
  }

  findBySlug(viewer: Viewer, slug: string): Promise<Mission | null> {
    return deferred(() => {
      const row = findVisibleIn(this.db, viewer, slug)
      return row === undefined ? null : load(this.db, row)
    })
  }

  events(missionId: string): Promise<readonly MissionEvent[]> {
    return deferred(() => {
      const rows = this.db
        .select()
        .from(missionEvents)
        .where(eq(missionEvents.missionId, missionId))
        .orderBy(asc(missionEvents.id))
        .all()
      const names = userNamesIn(
        this.db,
        rows.map((row) => row.actorUserId),
      )
      return rows.map((row) => toEvent(row, names))
    })
  }

  take(write: TakeWrite): Promise<TakeResult> {
    const { viewer, target, session, tokenHash, at } = write
    return deferred(() =>
      this.db.transaction((tx): TakeResult => {
        sweepIn(tx, at)
        const row =
          'slug' in target ? findVisibleIn(tx, viewer, target.slug) : nextReadyIn(tx, viewer, target.next)
        if (row === undefined) return { kind: 'slug' in target ? 'not-found' : 'empty' }
        const result = transition(load(tx, row), { type: 'take' }, { kind: 'session', session }, at)
        if (!result.ok) return { kind: 'refused', error: result.error }
        const { value } = result
        if (value.kind !== 'updated' || value.mission.status !== 'in_progress') {
          throw new Error('take doit produire une mission en cours')
        }
        persist(tx, value, tokenHash)
        return { kind: 'taken', mission: value.mission, event: value.event }
      }, IMMEDIATE),
    )
  }

  apply(write: ApplyWrite): Promise<ApplyResult> {
    const { viewer, slug, command, actor, tokenHash, at } = write
    return deferred(() =>
      this.db.transaction((tx): ApplyResult => {
        const row = findVisibleIn(tx, viewer, slug)
        if (row === undefined) return { kind: 'not-found' }
        const mission = load(tx, row)
        // Le jeton d'abord : sans lui, la session n'apprend rien des règles appliquées.
        if (!holdsToken(row, mission, actor, tokenHash)) return { kind: 'token-mismatch' }
        const result = transition(mission, command, actor, at)
        if (!result.ok) return { kind: 'refused', error: result.error }
        persist(tx, result.value)
        return { kind: 'applied', transition: result.value }
      }, IMMEDIATE),
    )
  }

  renew(write: RenewWrite): Promise<RenewResult> {
    const { viewer, slug, session, tokenHash, at } = write
    return deferred(() =>
      this.db.transaction((tx): RenewResult => {
        const row = findVisibleIn(tx, viewer, slug)
        if (row === undefined) return { kind: 'not-found' }
        const mission = load(tx, row)
        if (!holdsToken(row, mission, { kind: 'session', session }, tokenHash)) {
          return { kind: 'token-mismatch' }
        }
        const result = renewClaim(mission, session, at)
        if (!result.ok) return { kind: 'refused', error: result.error }
        // `updated_at` reste inchangé : c'est la garde de concurrence de « Modifier », qu'un
        // heartbeat ne doit pas périmer.
        tx.update(missions)
          .set({ claimExpiresAt: result.value.claim.expiresAt })
          .where(eq(missions.id, row.id))
          .run()
        return { kind: 'renewed', mission: result.value }
      }, IMMEDIATE),
    )
  }

  expireDue(now: Date): Promise<SweepResult> {
    return deferred(() => this.db.transaction((tx) => sweepIn(tx, now), IMMEDIATE))
  }
}
