/**
 * Missions en SQLite (Drizzle). Toute écriture est une transaction IMMEDIATE : le verrou d'écriture
 * est pris au BEGIN, avant la lecture de la mission. Deux connexions ne peuvent donc pas lire la même
 * mission `ready` puis la prendre chacune : la seconde attend (`busy_timeout`), puis lit la mission
 * déjà `in_progress` et la `transition` du domaine la refuse.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { z } from 'zod'

import { toContextId } from '@context-hub/domain/context/types.ts'
import { emptyStatusCounts } from '@context-hub/domain/missions/counts.ts'
import {
  editEvent,
  renewClaim,
  transition,
  type MissionCommand,
  type Transition,
} from '@context-hub/domain/missions/lifecycle.ts'
import {
  MISSION_FILTER_STATUSES,
  missionFromFields,
  toMissionFacets,
  toMissionSummary,
  type DraftMission,
  type Mission,
  type MissionActor,
  type Freshness,
  type MissionClaim,
  type MissionCore,
  type MissionEvent,
  type MissionEventActor,
  type MissionFacets,
  type MissionStatusCounts,
  type MissionStatusFields,
  type MissionSummary,
  type ReadyMission,
  type Validation,
} from '@context-hub/domain/missions/types.ts'
import { MissionResultSchema } from '@context-hub/domain/schemas/missions.ts'
import { isSameSession, type SessionRef } from '@context-hub/domain/sessions/session.ts'

import type {
  ApplyResult,
  ApplyWrite,
  MissionBatchOrigin,
  MissionQuery,
  MissionRows,
  MissionStore,
  RenewResult,
  RenewWrite,
  SweepResult,
  TakeResult,
  TakeWrite,
  UpdateResult,
  UpdateWrite,
} from '../../../application/ports/MissionStore.ts'
import type { Viewer } from '../../../application/viewer.ts'
import type { AppDatabase, SyncDb } from '../connection.ts'
import { isoDate } from '../dates.ts'
import { deferred } from '../deferred.ts'
import { missionEvents, missions, missionTags, users } from '../schema.ts'
import { IMMEDIATE } from '../transactions.ts'
import { appendEvent, insertTags, lifecycleColumns, missionRow } from './missionRecords.ts'
import { scopeOf, visibleIn } from './scopeRecords.ts'
import { userNameIn, userNamesIn } from './userRecords.ts'

type MissionRow = typeof missions.$inferSelect
type EventRow = typeof missionEvents.$inferSelect

/**
 * Colonnes de la file : tout sauf le prompt (jusqu'à 8 000 caractères, jamais affiché dans la liste)
 * et l'empreinte du jeton de réservation.
 */
const SUMMARY_COLUMNS = {
  id: missions.id,
  slug: missions.slug,
  title: missions.title,
  summary: missions.summary,
  priority: missions.priority,
  status: missions.status,
  scopeKind: missions.scopeKind,
  scopeValue: missions.scopeValue,
  originLabel: missions.originLabel,
  originBatchId: missions.originBatchId,
  originUserId: missions.originUserId,
  originSessionLabel: missions.originSessionLabel,
  originRepo: missions.originRepo,
  createdBy: missions.createdBy,
  codeRefRepo: missions.codeRefRepo,
  codeRefCommit: missions.codeRefCommit,
  codeRefFiles: missions.codeRefFiles,
  freshnessCheckedAt: missions.freshnessCheckedAt,
  freshnessChangedFiles: missions.freshnessChangedFiles,
  freshnessUserId: missions.freshnessUserId,
  freshnessSessionLabel: missions.freshnessSessionLabel,
  freshnessRepo: missions.freshnessRepo,
  linkedContextIds: missions.linkedContextIds,
  workspaceId: missions.workspaceId,
  suspicious: missions.suspicious,
  validationBy: missions.validationBy,
  validationAt: missions.validationAt,
  claimUserId: missions.claimUserId,
  claimSessionLabel: missions.claimSessionLabel,
  claimRepo: missions.claimRepo,
  claimAcquiredAt: missions.claimAcquiredAt,
  claimExpiresAt: missions.claimExpiresAt,
  result: missions.result,
  dropReason: missions.dropReason,
  createdAt: missions.createdAt,
  expiresAt: missions.expiresAt,
  closedAt: missions.closedAt,
  updatedAt: missions.updatedAt,
}
type SummaryRow = Omit<MissionRow, 'prompt' | 'claimTokenHash'>
type Names = ReadonlyMap<string, string>

const JOB: MissionActor = { kind: 'job' }
const StringListSchema = z.array(z.string())

// ── Lecture : ligne → domaine ────────────────────────────────────────────────

function parseJson<T>(text: string, schema: z.ZodType<T>): T {
  const value: unknown = JSON.parse(text)
  return schema.parse(value)
}

/** Colonne obligatoire pour ce statut : son absence est une incohérence de la base. */
function required<T>(value: T | null, column: string, row: SummaryRow): T {
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

function claimOf(row: SummaryRow, names: Names): MissionClaim {
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
function freshnessOf(row: SummaryRow, names: Names): Freshness | null {
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
function validationOf(row: SummaryRow): Validation | null {
  if (row.validationBy === null) return null
  return { by: row.validationBy, at: required(row.validationAt, 'validation_at', row) }
}

function summaryCoreOf(
  row: SummaryRow,
  tags: readonly string[],
  names: Names,
): Omit<MissionCore, 'prompt'> {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
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
    suspicious: row.suspicious,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    updatedAt: row.updatedAt,
  }
}

function statusFieldsOf(row: SummaryRow, names: Names): MissionStatusFields {
  return {
    status: row.status,
    validation: validationOf(row),
    claim: row.claimUserId === null ? null : claimOf(row, names),
    result: row.result === null ? null : parseJson(row.result, MissionResultSchema),
    dropReason: row.dropReason,
    closedAt: row.closedAt,
  }
}

function toMission(row: MissionRow, tags: readonly string[], names: Names): Mission {
  return missionFromFields(
    { ...summaryCoreOf(row, tags, names), prompt: row.prompt },
    statusFieldsOf(row, names),
  )
}

/**
 * Résumé de la file : même reconstruction par statut (incohérence détectée de la même façon), sans le
 * prompt, qui n'est pas lu ; la chaîne vide ne sort pas d'ici (`toMissionSummary` l'écarte).
 */
function toSummary(row: SummaryRow, tags: readonly string[], names: Names): MissionSummary {
  return toMissionSummary(
    missionFromFields(
      { ...summaryCoreOf(row, tags, names), prompt: '' },
      statusFieldsOf(row, names),
    ),
  )
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

/** Tags de plusieurs missions en une requête, dans l'ordre saisi. */
function tagsIn(db: SyncDb, missionIds: readonly string[]): ReadonlyMap<string, string[]> {
  const byMission = new Map<string, string[]>()
  if (missionIds.length === 0) return byMission
  const rows = db
    .select({ missionId: missionTags.missionId, tag: missionTags.tag })
    .from(missionTags)
    .where(inArray(missionTags.missionId, [...missionIds]))
    .orderBy(asc(missionTags.missionId), asc(missionTags.position))
    .all()
  for (const { missionId, tag } of rows) {
    byMission.set(missionId, [...(byMission.get(missionId) ?? []), tag])
  }
  return byMission
}

/** Tags et noms d'un lot de lignes, chargés en une requête chacun. */
function relationsIn(
  db: SyncDb,
  rows: readonly SummaryRow[],
): { tags: ReadonlyMap<string, string[]>; names: Names } {
  return {
    tags: tagsIn(
      db,
      rows.map((row) => row.id),
    ),
    names: userNamesIn(
      db,
      rows.flatMap((row) => [row.originUserId, row.freshnessUserId, row.claimUserId]),
    ),
  }
}

function loadAll(db: SyncDb, rows: readonly MissionRow[]): Mission[] {
  const { tags, names } = relationsIn(db, rows)
  return rows.map((row) => toMission(row, tags.get(row.id) ?? [], names))
}

function loadSummaries(db: SyncDb, rows: readonly SummaryRow[]): MissionSummary[] {
  const { tags, names } = relationsIn(db, rows)
  return rows.map((row) => toSummary(row, tags.get(row.id) ?? [], names))
}

function load(db: SyncDb, row: MissionRow): Mission {
  const [mission] = loadAll(db, [row])
  if (mission === undefined) throw new Error(`Mission ${row.id} illisible`)
  return mission
}

// ── Écriture : domaine → ligne ───────────────────────────────────────────────

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

/** Ordre de la file : priorité (P1 d'abord), puis ancienneté. */
const QUEUE_ORDER = [asc(missions.priority), asc(missions.createdAt), asc(missions.id)] as const

/** Conditions communes de la file : visibilité, TOUS les tags, repo et lot s'ils sont donnés. */
function queueConditions(
  db: SyncDb,
  viewer: Viewer,
  filters: Omit<MissionQuery, 'statuses' | 'batchId' | 'archiveLimit'> & {
    readonly batchId?: string | null
  },
): SQL[] {
  const conditions = [visibleTo(viewer)]
  for (const tag of filters.tags) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(missionTags)
          .where(and(eq(missionTags.missionId, missions.id), eq(missionTags.tag, tag))),
      ),
    )
  }
  if (filters.repo !== null) conditions.push(eq(missions.codeRefRepo, filters.repo))
  if (filters.batchId != null) conditions.push(eq(missions.originBatchId, filters.batchId))
  return conditions
}

/** La prochaine mission prête : la plus prioritaire, puis la plus ancienne, qui correspond. */
function nextReadyIn(
  db: SyncDb,
  viewer: Viewer,
  filters: { readonly tags: readonly string[]; readonly repo: string | null },
): MissionRow | undefined {
  return db
    .select()
    .from(missions)
    .where(and(eq(missions.status, 'ready'), ...queueConditions(db, viewer, filters)))
    .orderBy(...QUEUE_ORDER)
    .get()
}

/**
 * Borne des missions archivées : seules les `archiveLimit` closes le plus récemment restent ; les
 * missions ouvertes ne sont pas bornées (elles expirent à 14 jours). Tri d'affichage inchangé.
 */
function archiveBound(db: SyncDb, query: MissionQuery, conditions: readonly SQL[]): SQL[] {
  const archived = query.statuses.filter((status) =>
    MISSION_FILTER_STATUSES.archived.includes(status),
  )
  if (query.archiveLimit === null || archived.length === 0) return []
  const recent = db
    .select({ id: missions.id })
    .from(missions)
    .where(and(inArray(missions.status, archived), ...conditions))
    .orderBy(desc(missions.closedAt), desc(missions.id))
    .limit(query.archiveLimit)
  const bound = or(notInArray(missions.status, archived), inArray(missions.id, recent))
  return bound === undefined ? [] : [bound]
}

function statusCountsIn(db: SyncDb, conditions: readonly SQL[]): MissionStatusCounts {
  const rows = db
    .select({ status: missions.status, total: count() })
    .from(missions)
    .where(and(...conditions))
    .groupBy(missions.status)
    .all()
  const counts = emptyStatusCounts()
  for (const row of rows) counts[row.status] = row.total
  return counts
}

/**
 * Balaye l'échu, dans la transaction en cours : réservations expirées libérées, puis missions non
 * prises arrivées à échéance expirées. Chaque changement passe par `transition` (acteur : le job).
 */
function sweepIn(db: SyncDb, now: Date): SweepResult {
  const at = isoDate(now)
  // Lignes chargées en lot (tags et noms : une requête chacun), le verrou d'écriture étant tenu.
  const apply = (rows: readonly MissionRow[], command: MissionCommand): number => {
    let applied = 0
    for (const mission of loadAll(db, rows)) {
      const result = transition(mission, command, JOB, now)
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
        tx.insert(missions).values(missionRow(mission)).run()
        insertTags(tx, mission.id, mission.tags)
        appendEvent(tx, event)
        return true
      }, IMMEDIATE),
    )
  }

  facets(viewer: Viewer, batchId: string | null): Promise<MissionFacets> {
    return deferred(() => {
      const conditions = queueConditions(this.db, viewer, { tags: [], repo: null, batchId })
      const tags = this.db
        .selectDistinct({ tag: missionTags.tag })
        .from(missionTags)
        .innerJoin(missions, eq(missions.id, missionTags.missionId))
        .where(and(...conditions))
        .all()
      const repos = this.db
        .selectDistinct({ repo: missions.codeRefRepo })
        .from(missions)
        .where(and(...conditions))
        .all()
      return toMissionFacets(
        tags.map(({ tag }) => tag),
        repos.map(({ repo }) => repo),
      )
    })
  }

  batchOrigin(viewer: Viewer, batchId: string): Promise<MissionBatchOrigin | null> {
    return deferred(() => {
      const conditions = queueConditions(this.db, viewer, { tags: [], repo: null, batchId })
      const first = this.db
        .select({
          label: missions.originLabel,
          userId: missions.originUserId,
          userName: users.name,
          sessionLabel: missions.originSessionLabel,
          sessionRepo: missions.originRepo,
          repo: missions.codeRefRepo,
          commit: missions.codeRefCommit,
          createdAt: missions.createdAt,
        })
        .from(missions)
        .leftJoin(users, eq(users.id, missions.originUserId))
        .where(and(...conditions))
        .orderBy(asc(missions.createdAt), asc(missions.id))
        .limit(1)
        .get()
      if (first === undefined) return null
      const names: Names = new Map(
        first.userId !== null && first.userName !== null ? [[first.userId, first.userName]] : [],
      )
      return {
        label: first.label,
        session: sessionOf(names, first.userId, first.sessionLabel, first.sessionRepo),
        repo: first.repo,
        commit: first.commit,
        createdAt: first.createdAt,
        counts: statusCountsIn(this.db, conditions),
      }
    })
  }

  list(viewer: Viewer, query: MissionQuery): Promise<MissionRows> {
    return deferred(() => {
      const conditions = queueConditions(this.db, viewer, query)
      const rows =
        query.statuses.length === 0
          ? []
          : this.db
              .select(SUMMARY_COLUMNS)
              .from(missions)
              .where(
                and(
                  inArray(missions.status, [...query.statuses]),
                  ...conditions,
                  ...archiveBound(this.db, query, conditions),
                ),
              )
              .orderBy(...QUEUE_ORDER)
              .all()
      return {
        missions: loadSummaries(this.db, rows),
        statusCounts: statusCountsIn(this.db, conditions),
      }
    })
  }

  update(write: UpdateWrite): Promise<UpdateResult> {
    const { viewer, slug, expectedUpdatedAt, changes, at } = write
    return deferred(() =>
      this.db.transaction((tx): UpdateResult => {
        const row = findVisibleIn(tx, viewer, slug)
        if (row === undefined) return { kind: 'not-found' }
        if (row.updatedAt !== expectedUpdatedAt)
          return { kind: 'conflict', updatedAt: row.updatedAt }
        const mission = load(tx, row)
        if (mission.status !== 'draft' && mission.status !== 'ready') {
          return { kind: 'not-editable', status: mission.status }
        }
        const updatedAt = isoDate(at)
        tx.update(missions)
          .set({
            title: changes.title,
            summary: changes.summary,
            prompt: changes.prompt,
            priority: changes.priority,
            suspicious: changes.suspicious,
            updatedAt,
          })
          .where(eq(missions.id, row.id))
          .run()
        tx.delete(missionTags).where(eq(missionTags.missionId, row.id)).run()
        insertTags(tx, row.id, changes.tags)
        const edited = editEvent(mission, changes, viewer.userId, at)
        if (edited !== null) appendEvent(tx, edited)
        return { kind: 'updated', mission: { ...mission, ...changes, updatedAt } }
      }, IMMEDIATE),
    )
  }

  userName(userId: string): Promise<string | null> {
    return deferred(() => userNameIn(this.db, userId))
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
          'slug' in target
            ? findVisibleIn(tx, viewer, target.slug)
            : nextReadyIn(tx, viewer, target.next)
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
