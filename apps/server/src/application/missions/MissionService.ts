/**
 * Cas d'usage des Missions (SPEC §8), partagés par l'API REST (humains, UI) et le MCP (sessions).
 *
 * Le serveur fait autorité : chaque création ou modification est relue par `reviewMission` (gabarit,
 * taille, scan), chaque changement d'état passe par la `transition` du domaine, dans la transaction
 * du store. Le prompt d'une mission est une INSTRUCTION écrite par un tiers : la surface MCP le
 * rappelle à la session qui la prend.
 */
import { randomInt } from 'node:crypto'

import { slugify } from '@context-hub/domain/context/slug.ts'
import { toContextId, type Scope } from '@context-hub/domain/context/types.ts'
import {
  MissionBatchNotFoundError,
  MissionConflictError,
  MissionNotFoundError,
  MissionReservationError,
  MissionRuleError,
  MissionTransitionError,
} from '@context-hub/domain/missions/errors.ts'
import {
  createMission,
  type CreatorActor,
  type Transition,
} from '@context-hub/domain/missions/lifecycle.ts'
import {
  cleanChangedFiles,
  redactMissionResult,
  redactReason,
  reviewMission,
  type MissionContent,
} from '@context-hub/domain/missions/review.ts'
import { toFilterCounts } from '@context-hub/domain/missions/counts.ts'
import {
  MISSION_FILTER_STATUSES,
  type InProgressMission,
  type Mission,
  type MissionBatch,
  type MissionDetail,
  type MissionEvent,
  type MissionActor,
  type MissionLinkedContext,
  type MissionList,
  type MissionQueueFilter,
  type MissionResult,
  type Priority,
  promptTokens,
  toMissionSummary,
} from '@context-hub/domain/missions/types.ts'
import type { SessionRef } from '@context-hub/domain/sessions/session.ts'

import type { Clock } from '../ports/Clock.ts'
import type { ContextStore } from '../ports/ContextStore.ts'
import type {
  ApplyCommand,
  ApplyResult,
  MissionStore,
  RenewResult,
  TakeResult,
  TakeTarget,
  UpdateResult,
} from '../ports/MissionStore.ts'
import type { SessionInput } from '../sessionKey.ts'
import type { Viewer } from '../viewer.ts'
import { generateReservationToken, hashReservationToken } from './reservationToken.ts'

export type MissionScopeInput =
  | { readonly kind: 'personal' }
  | { readonly kind: 'team'; readonly team: string }
  | { readonly kind: 'project'; readonly repo: string }

export interface CreateMissionInput {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
  readonly scope: MissionScopeInput
  readonly origin: { readonly label: string; readonly batchId: string | null }
  readonly codeRef: {
    readonly repo: string
    readonly commit: string
    readonly files: readonly string[]
  }
  readonly linkedContextIds: readonly string[]
}

export interface UpdateMissionInput {
  readonly title?: string | undefined
  readonly summary?: string | undefined
  readonly prompt?: string | undefined
  readonly priority?: Priority | undefined
  readonly tags?: readonly string[] | undefined
  readonly expectedUpdatedAt: string
}

export interface MissionListQuery {
  readonly filter: MissionQueueFilter
  readonly tags: readonly string[]
  readonly repo: string | null
  readonly batchId: string | null
}

/** Session qui agit sur la mission qu'elle tient : jeton remis par `take`. */
export interface HolderInput extends SessionInput {
  readonly token: string
}

/** Ce que reçoit la session qui prend une mission. */
export interface TakenMission {
  readonly mission: InProgressMission
  /** Jeton de réservation : à présenter pour `complete`, `drop`, `release`, `freshness`. */
  readonly token: string
  readonly promptTokens: number
  readonly linkedContexts: readonly MissionLinkedContext[]
}

export interface MissionServiceDependencies {
  readonly store: MissionStore
  readonly contextStore: ContextStore
  readonly clock: Clock
  readonly newId: () => string
  /** Jeton de réservation (tests : prévisible). */
  readonly newToken?: () => string
}

const SLUG_MAX_LENGTH = 60
const SLUG_ATTEMPTS = 10
/** Suffixes lisibles (`-2`, `-3`), puis aléatoires : un titre récurrent ne bloque jamais la création. */
const READABLE_SLUG_ATTEMPTS = 3

/** Acteur d'une commande `apply` (le job n'en passe pas : il balaye dans le store). */
type HumanOrSession = Exclude<MissionActor, { readonly kind: 'job' }>

function slugCandidate(base: string, attempt: number): string {
  if (attempt === 1) return base
  if (attempt <= READABLE_SLUG_ATTEMPTS) return `${base}-${String(attempt)}`
  return `${base}-${randomInt(36 ** 4)
    .toString(36)
    .padStart(4, '0')}`
}

export class MissionService {
  private readonly store: MissionStore
  private readonly contextStore: ContextStore
  private readonly clock: Clock
  private readonly newId: () => string
  private readonly newToken: () => string

  constructor(dependencies: MissionServiceDependencies) {
    this.store = dependencies.store
    this.contextStore = dependencies.contextStore
    this.clock = dependencies.clock
    this.newId = dependencies.newId
    this.newToken = dependencies.newToken ?? generateReservationToken
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  async list(viewer: Viewer, query: MissionListQuery): Promise<MissionList> {
    const { missions, statusCounts } = await this.store.list(viewer, {
      statuses: MISSION_FILTER_STATUSES[query.filter],
      tags: query.tags,
      repo: query.repo,
      batchId: query.batchId,
    })
    return { items: missions.map(toMissionSummary), counts: toFilterCounts(statusCounts) }
  }

  /** Compteur « À traiter » de la sidebar, sans charger les missions. */
  async todoCount(viewer: Viewer): Promise<number> {
    const { statusCounts } = await this.store.list(viewer, {
      statuses: [],
      tags: [],
      repo: null,
      batchId: null,
    })
    return toFilterCounts(statusCounts).todo
  }

  /** Bloc « Origine » d'un lot. @throws MissionNotFoundError */
  async batch(viewer: Viewer, batchId: string): Promise<MissionBatch> {
    const { missions, statusCounts } = await this.store.list(viewer, {
      statuses: MISSION_FILTER_STATUSES.all,
      tags: [],
      repo: null,
      batchId,
    })
    const first = missions.reduce<Mission | undefined>(
      (oldest, mission) =>
        oldest === undefined || mission.createdAt < oldest.createdAt ? mission : oldest,
      undefined,
    )
    if (first === undefined) throw new MissionBatchNotFoundError(batchId)
    return {
      batchId,
      label: first.origin.label,
      session: first.origin.session,
      repo: first.codeRef.repo,
      commit: first.codeRef.commit,
      createdAt: first.createdAt,
      counts: statusCounts,
      total: missions.length,
    }
  }

  /** @throws MissionNotFoundError */
  async get(viewer: Viewer, slug: string): Promise<MissionDetail> {
    return this.detail(viewer, await this.find(viewer, slug))
  }

  // ── Création et modification ───────────────────────────────────────────────

  /** Création par un humain (UI) : prête directement. @throws MissionRuleError */
  createByHuman(viewer: Viewer, input: CreateMissionInput): Promise<MissionDetail> {
    return this.create(viewer, input, { kind: 'human', userId: viewer.userId })
  }

  /**
   * Création par une session (MCP) : à valider en portée équipe ou projet, prête en portée
   * personnelle. @throws MissionRuleError
   */
  async createBySession(
    viewer: Viewer,
    input: CreateMissionInput,
    session: SessionInput,
  ): Promise<MissionDetail> {
    return this.create(viewer, input, {
      kind: 'session',
      session: await this.sessionRef(viewer, session),
    })
  }

  /** « Modifier » une mission à valider ou prête. @throws MissionRuleError, MissionConflictError */
  async update(viewer: Viewer, slug: string, input: UpdateMissionInput): Promise<MissionDetail> {
    const current = await this.find(viewer, slug)
    if (current.updatedAt !== input.expectedUpdatedAt) {
      throw new MissionConflictError(slug, current.updatedAt)
    }
    const content: MissionContent = {
      title: input.title ?? current.title,
      summary: input.summary ?? current.summary,
      prompt: input.prompt ?? current.prompt,
      tags: input.tags ?? current.tags,
      originLabel: current.origin.label,
      team: current.scope.kind === 'team' ? current.scope.team : null,
      codeRef: current.codeRef,
    }
    const review = reviewMission(content, 'human')
    if (review.violations.length > 0) {
      throw new MissionRuleError(review.violations, review.missingSections)
    }
    const result = await this.store.update({
      viewer,
      slug,
      expectedUpdatedAt: input.expectedUpdatedAt,
      at: this.clock.now(),
      changes: {
        title: content.title.trim(),
        summary: content.summary.trim(),
        prompt: content.prompt,
        priority: input.priority ?? current.priority,
        tags: content.tags,
        suspicious: review.suspicious,
      },
    })
    return this.detail(viewer, updatedOrThrow(slug, result))
  }

  // ── Actions humaines (UI) ──────────────────────────────────────────────────

  validate(viewer: Viewer, slug: string): Promise<MissionDetail> {
    return this.human(viewer, slug, { type: 'validate' })
  }

  /** Rejet d'une mission à valider : elle est supprimée ; renvoie l'événement. */
  async reject(viewer: Viewer, slug: string, reason: string | null): Promise<MissionEvent> {
    const transition = await this.applyAs(
      viewer,
      slug,
      { type: 'reject', reason: reason === null ? null : redactReason(reason) },
      human(viewer),
    )
    return transition.event
  }

  /** Libération forcée par un humain : la mission redevient prête. */
  release(viewer: Viewer, slug: string): Promise<MissionDetail> {
    return this.human(viewer, slug, { type: 'release' })
  }

  drop(viewer: Viewer, slug: string, reason: string): Promise<MissionDetail> {
    return this.human(viewer, slug, { type: 'drop', reason: redactReason(reason) })
  }

  reopen(viewer: Viewer, slug: string): Promise<MissionDetail> {
    return this.human(viewer, slug, { type: 'reopen' })
  }

  // ── Sessions (MCP, plugin) ─────────────────────────────────────────────────

  /**
   * Prend une mission (par slug, ou la prochaine prête). `null` : file vide pour `next`.
   * @throws MissionNotFoundError, MissionTransitionError
   */
  async take(
    viewer: Viewer,
    target: TakeTarget,
    session: SessionInput,
  ): Promise<TakenMission | null> {
    const token = this.newToken()
    const result: TakeResult = await this.store.take({
      viewer,
      target,
      session: await this.sessionRef(viewer, session),
      tokenHash: hashReservationToken(token),
      at: this.clock.now(),
    })
    switch (result.kind) {
      case 'empty':
        return null
      case 'not-found':
        throw new MissionNotFoundError('slug' in target ? target.slug : 'next')
      case 'refused':
        throw new MissionTransitionError(result.error)
      case 'taken':
        return {
          mission: result.mission,
          token,
          promptTokens: promptTokens(result.mission.prompt),
          linkedContexts: await this.linkedContexts(viewer, result.mission),
        }
    }
  }

  /** Contrôle de fraîcheur rapporté par la session (`git diff --name-only`). */
  freshness(
    viewer: Viewer,
    slug: string,
    holder: HolderInput,
    changedFiles: readonly string[],
  ): Promise<Mission> {
    return this.bySession(viewer, slug, holder, {
      type: 'freshness',
      changedFiles: cleanChangedFiles(changedFiles),
    })
  }

  complete(
    viewer: Viewer,
    slug: string,
    holder: HolderInput,
    result: MissionResult,
  ): Promise<Mission> {
    return this.bySession(viewer, slug, holder, {
      type: 'complete',
      result: redactMissionResult(result),
    })
  }

  dropBySession(
    viewer: Viewer,
    slug: string,
    holder: HolderInput,
    reason: string,
  ): Promise<Mission> {
    return this.bySession(viewer, slug, holder, { type: 'drop', reason: redactReason(reason) })
  }

  releaseBySession(viewer: Viewer, slug: string, holder: HolderInput): Promise<Mission> {
    return this.bySession(viewer, slug, holder, { type: 'release' })
  }

  /** Heartbeat (hook du plugin) : prolonge la réservation. Renvoie la nouvelle échéance. */
  async heartbeat(
    viewer: Viewer,
    slug: string,
    holder: HolderInput,
  ): Promise<{ expiresAt: string }> {
    const result: RenewResult = await this.store.renew({
      viewer,
      slug,
      session: await this.sessionRef(viewer, holder),
      tokenHash: hashReservationToken(holder.token),
      at: this.clock.now(),
    })
    switch (result.kind) {
      case 'renewed':
        return { expiresAt: result.mission.claim.expiresAt }
      case 'not-found':
        throw new MissionNotFoundError(slug)
      case 'refused':
        throw new MissionTransitionError(result.error)
      case 'token-mismatch':
        throw new MissionReservationError(slug)
    }
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  private async create(
    viewer: Viewer,
    input: CreateMissionInput,
    creator: CreatorActor,
  ): Promise<MissionDetail> {
    const review = reviewMission(
      {
        title: input.title,
        summary: input.summary,
        prompt: input.prompt,
        tags: input.tags,
        originLabel: input.origin.label,
        team: input.scope.kind === 'team' ? input.scope.team : null,
        codeRef: input.codeRef,
      },
      creator.kind,
    )
    if (review.violations.length > 0) {
      throw new MissionRuleError(review.violations, review.missingSections)
    }
    const linkedContextIds = await this.checkLinkedContexts(viewer, input.linkedContextIds)
    const base = slugify(input.title).slice(0, SLUG_MAX_LENGTH).replace(/-+$/, '') || 'mission'
    for (let attempt = 1; attempt <= SLUG_ATTEMPTS; attempt += 1) {
      const { mission, event } = createMission(
        {
          id: this.newId(),
          slug: slugCandidate(base, attempt),
          title: input.title.trim(),
          summary: input.summary.trim(),
          prompt: input.prompt,
          priority: input.priority,
          tags: input.tags,
          scope: scopeOf(viewer, input.scope),
          origin: {
            label: input.origin.label.trim(),
            batchId: input.origin.batchId,
            session: creator.kind === 'session' ? creator.session : null,
            createdBy: viewer.userId,
          },
          codeRef: { ...input.codeRef, files: review.files },
          freshness: null,
          linkedContextIds: linkedContextIds.map(toContextId),
          workspaceId: null,
          suspicious: review.suspicious,
        },
        creator,
        this.clock.now(),
      )
      if (await this.store.create(mission, event)) return this.detail(viewer, mission)
    }
    throw new MissionRuleError(['slug-taken'])
  }

  private async find(viewer: Viewer, slug: string): Promise<Mission> {
    const mission = await this.store.findBySlug(viewer, slug)
    if (mission === null) throw new MissionNotFoundError(slug)
    return mission
  }

  private async detail(viewer: Viewer, mission: Mission): Promise<MissionDetail> {
    const [linkedContexts, events] = await Promise.all([
      this.linkedContexts(viewer, mission),
      this.store.events(mission.id),
    ])
    return { mission, promptTokens: promptTokens(mission.prompt), linkedContexts, events }
  }

  private async human(viewer: Viewer, slug: string, command: ApplyCommand): Promise<MissionDetail> {
    const transition = await this.applyAs(viewer, slug, command, human(viewer))
    if (transition.kind === 'deleted') throw new MissionNotFoundError(slug)
    return this.detail(viewer, transition.mission)
  }

  private async bySession(
    viewer: Viewer,
    slug: string,
    holder: HolderInput,
    command: ApplyCommand,
  ): Promise<Mission> {
    const session = await this.sessionRef(viewer, holder)
    const transition = await this.applyAs(
      viewer,
      slug,
      command,
      { kind: 'session', session },
      hashReservationToken(holder.token),
    )
    if (transition.kind === 'deleted') throw new MissionNotFoundError(slug)
    return transition.mission
  }

  private async applyAs(
    viewer: Viewer,
    slug: string,
    command: ApplyCommand,
    actor: HumanOrSession,
    tokenHash: string | null = null,
  ): Promise<Transition> {
    const result: ApplyResult = await this.store.apply({
      viewer,
      slug,
      command,
      actor,
      tokenHash,
      at: this.clock.now(),
    })
    switch (result.kind) {
      case 'applied':
        return result.transition
      case 'not-found':
        throw new MissionNotFoundError(slug)
      case 'refused':
        throw new MissionTransitionError(result.error)
      case 'token-mismatch':
        throw new MissionReservationError(slug)
    }
  }

  private async sessionRef(viewer: Viewer, input: SessionInput): Promise<SessionRef> {
    return {
      userId: viewer.userId,
      userName: (await this.store.userName(viewer.userId)) ?? viewer.userId,
      sessionLabel: input.session,
      repo: input.repo,
    }
  }

  /** Contextes liés publiés et visibles, dans l'ordre demandé. @throws MissionRuleError */
  private async checkLinkedContexts(viewer: Viewer, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const published = new Set<string>(
      (await this.contextStore.listPublished(viewer)).map(({ id }) => id),
    )
    const unique = [...new Set(ids)]
    if (!unique.every((id) => published.has(id))) throw new MissionRuleError(['unknown-context'])
    return unique
  }

  /** Contextes liés encore publiés et visibles (un contexte archivé disparaît du détail). */
  private async linkedContexts(
    viewer: Viewer,
    mission: Pick<Mission, 'linkedContextIds'>,
  ): Promise<MissionLinkedContext[]> {
    if (mission.linkedContextIds.length === 0) return []
    const published = new Map(
      (await this.contextStore.listPublished(viewer)).map((summary) => [summary.id, summary]),
    )
    return mission.linkedContextIds.flatMap((id) => {
      const summary = published.get(id)
      return summary
        ? [{ id, slug: summary.slug, title: summary.title, version: summary.version }]
        : []
    })
  }
}

function human(viewer: Viewer): { readonly kind: 'human'; readonly userId: string } {
  return { kind: 'human', userId: viewer.userId }
}

/** Une portée personnelle est toujours celle de son auteur. */
function scopeOf(viewer: Viewer, input: MissionScopeInput): Scope {
  switch (input.kind) {
    case 'personal':
      return { kind: 'personal', owner: viewer.userId }
    case 'team':
      return { kind: 'team', team: input.team }
    case 'project':
      return { kind: 'project', repo: input.repo }
  }
}

function updatedOrThrow(slug: string, result: UpdateResult): Mission {
  switch (result.kind) {
    case 'updated':
      return result.mission
    case 'not-found':
      throw new MissionNotFoundError(slug)
    case 'conflict':
      throw new MissionConflictError(slug, result.updatedAt)
    case 'not-editable':
      throw new MissionTransitionError({
        rejection: 'invalid-status',
        status: result.status,
        command: 'edit',
      })
  }
}
