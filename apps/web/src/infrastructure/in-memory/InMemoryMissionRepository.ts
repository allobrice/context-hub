import { slugify } from '@context-hub/domain/context/slug.ts'
import { toContextId, type Scope } from '@context-hub/domain/context/types.ts'
import {
  MissionBatchNotFoundError,
  MissionConflictError,
  MissionNotFoundError,
  MissionRuleError,
  MissionTransitionError,
} from '@context-hub/domain/missions/errors.ts'
import {
  createMission,
  transition,
  type MissionCommand,
} from '@context-hub/domain/missions/lifecycle.ts'
import { redactReason, reviewMission } from '@context-hub/domain/missions/review.ts'
import {
  MISSION_FILTER_STATUSES,
  toMissionSummary,
  type Mission,
  type MissionBatch,
  type MissionDetail,
  type MissionLinkedContext,
  type MissionList,
  type MissionStatus,
  type MissionStatusCounts,
  promptTokens,
} from '@context-hub/domain/missions/types.ts'

import type { Clock } from '../../application/ports/Clock.ts'
import type {
  CreateMissionCommand,
  MissionListQuery,
  MissionRepository,
  MissionScopeInput,
  UpdateMissionCommand,
} from '../../application/ports/MissionRepository.ts'
import { visibleState, type InMemoryState, type MissionRecord } from './InMemoryStore.ts'
import {
  simulateMutation,
  simulatePrimary,
  simulateSecondary,
  type SimulationOptions,
} from './simulation.ts'

/** Utilisateur de la démo (les actions humaines de l'UI lui sont attribuées). */
const CURRENT_USER_ID = 'brice'
const HUMAN = { kind: 'human', userId: CURRENT_USER_ID } as const

/** File par priorité, puis ancienneté (comme le serveur). */
function byQueueOrder(a: MissionRecord, b: MissionRecord): number {
  return (
    a.mission.priority.localeCompare(b.mission.priority) ||
    a.mission.createdAt.localeCompare(b.mission.createdAt) ||
    a.mission.id.localeCompare(b.mission.id)
  )
}

function statusCounts(records: readonly MissionRecord[]): MissionStatusCounts {
  const counts: Record<MissionStatus, number> = {
    draft: 0,
    ready: 0,
    in_progress: 0,
    done: 0,
    dropped: 0,
    expired: 0,
  }
  for (const { mission } of records) counts[mission.status] += 1
  return counts
}

function scopeOf(input: MissionScopeInput): Scope {
  switch (input.kind) {
    case 'personal':
      return { kind: 'personal', owner: CURRENT_USER_ID }
    case 'team':
      return { kind: 'team', team: input.team }
    case 'project':
      return { kind: 'project', repo: input.repo }
  }
}

/** Joue le rôle du serveur : mêmes règles du domaine (relecture, cycle de vie, garde de version). */
export class InMemoryMissionRepository implements MissionRepository {
  private sequence = 0

  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
    private readonly clock: Clock,
  ) {}

  list(query: MissionListQuery): Promise<MissionList> {
    return simulatePrimary(this.simulation, () => {
      const matching = this.visible().filter(
        ({ mission }) =>
          query.tags.every((tag) => mission.tags.includes(tag)) &&
          (query.repo === null || mission.codeRef.repo === query.repo) &&
          (query.batchId === null || mission.origin.batchId === query.batchId),
      )
      const counts = statusCounts(matching)
      const total = (statuses: readonly MissionStatus[]) =>
        statuses.reduce((sum, status) => sum + counts[status], 0)
      return {
        items: matching
          .filter(({ mission }) => MISSION_FILTER_STATUSES[query.filter].includes(mission.status))
          .sort(byQueueOrder)
          .map(({ mission }) => toMissionSummary(mission)),
        counts: {
          todo: total(MISSION_FILTER_STATUSES.todo),
          to_validate: total(MISSION_FILTER_STATUSES.to_validate),
          ready: total(MISSION_FILTER_STATUSES.ready),
          archived: total(MISSION_FILTER_STATUSES.archived),
          all: total(MISSION_FILTER_STATUSES.all),
        },
      }
    })
  }

  batch(batchId: string): Promise<MissionBatch> {
    return simulateSecondary(this.simulation, () => {
      const records = this.visible().filter(({ mission }) => mission.origin.batchId === batchId)
      const first = [...records].sort((a, b) =>
        a.mission.createdAt.localeCompare(b.mission.createdAt),
      )[0]
      if (first === undefined) throw new MissionBatchNotFoundError(batchId)
      const { mission } = first
      return {
        batchId,
        label: mission.origin.label,
        session: mission.origin.session,
        repo: mission.codeRef.repo,
        commit: mission.codeRef.commit,
        createdAt: mission.createdAt,
        counts: statusCounts(records),
        total: records.length,
      }
    })
  }

  get(slug: string): Promise<MissionDetail> {
    return simulatePrimary(this.simulation, () => this.detail(this.find(slug)))
  }

  create(command: CreateMissionCommand): Promise<MissionDetail> {
    return simulateMutation(this.simulation, () => {
      const review = reviewMission(
        {
          title: command.title,
          summary: command.summary,
          prompt: command.prompt,
          tags: command.tags,
          originLabel: command.origin.label,
          team: command.scope.kind === 'team' ? command.scope.team : null,
          codeRef: command.codeRef,
        },
        'human',
      )
      if (review.violations.length > 0) {
        throw new MissionRuleError(review.violations, review.missingSections)
      }
      const known = new Set(this.state.contexts.map(({ context }) => context.id))
      if (!command.linkedContextIds.every((id) => known.has(toContextId(id)))) {
        throw new MissionRuleError(['unknown-context'])
      }
      this.sequence += 1
      const { mission, event } = createMission(
        {
          id: `mission-ui-${String(this.sequence)}`,
          slug: this.freeSlug(command.title),
          title: command.title.trim(),
          summary: command.summary.trim(),
          prompt: command.prompt,
          priority: command.priority,
          tags: command.tags,
          scope: scopeOf(command.scope),
          origin: { ...command.origin, session: null, createdBy: CURRENT_USER_ID },
          codeRef: { ...command.codeRef, files: review.files },
          freshness: null,
          linkedContextIds: command.linkedContextIds.map(toContextId),
          workspaceId: null,
          suspicious: review.suspicious,
        },
        HUMAN,
        this.clock.now(),
      )
      const record = { mission, events: [event] }
      this.state.missions.push(record)
      return this.detail(record)
    })
  }

  update(slug: string, command: UpdateMissionCommand): Promise<MissionDetail> {
    return simulateMutation(this.simulation, () => {
      const record = this.find(slug)
      const { mission } = record
      if (mission.updatedAt !== command.expectedUpdatedAt) {
        throw new MissionConflictError(slug, mission.updatedAt)
      }
      if (mission.status !== 'draft' && mission.status !== 'ready') {
        throw new MissionTransitionError({
          rejection: 'invalid-status',
          status: mission.status,
          command: 'edit',
        })
      }
      const review = reviewMission(
        {
          title: command.title,
          summary: command.summary,
          prompt: command.prompt,
          tags: command.tags,
          originLabel: mission.origin.label,
          team: mission.scope.kind === 'team' ? mission.scope.team : null,
          codeRef: mission.codeRef,
        },
        'human',
      )
      if (review.violations.length > 0) {
        throw new MissionRuleError(review.violations, review.missingSections)
      }
      record.mission = {
        ...mission,
        title: command.title.trim(),
        summary: command.summary.trim(),
        prompt: command.prompt,
        priority: command.priority,
        tags: command.tags,
        suspicious: review.suspicious,
        updatedAt: this.clock.now().toISOString(),
      }
      return this.detail(record)
    })
  }

  validate(slug: string): Promise<MissionDetail> {
    return this.act(slug, { type: 'validate' })
  }

  async reject(slug: string, reason: string | null): Promise<void> {
    await simulateMutation(this.simulation, () => {
      this.apply(this.find(slug), {
        type: 'reject',
        reason: reason === null ? null : redactReason(reason),
      })
    })
  }

  release(slug: string): Promise<MissionDetail> {
    return this.act(slug, { type: 'release' })
  }

  drop(slug: string, reason: string): Promise<MissionDetail> {
    return this.act(slug, { type: 'drop', reason: redactReason(reason) })
  }

  reopen(slug: string): Promise<MissionDetail> {
    return this.act(slug, { type: 'reopen' })
  }

  private act(slug: string, command: MissionCommand): Promise<MissionDetail> {
    return simulateMutation(this.simulation, () => {
      const record = this.find(slug)
      this.apply(record, command)
      return this.detail(record)
    })
  }

  /** Transition du domaine, au nom de l'utilisateur de la démo ; un rejet supprime la mission. */
  private apply(record: MissionRecord, command: MissionCommand): void {
    const result = transition(record.mission, command, HUMAN, this.clock.now())
    if (!result.ok) throw new MissionTransitionError(result.error)
    const { value } = result
    if (value.kind === 'deleted') {
      this.state.missions = this.state.missions.filter((item) => item !== record)
      return
    }
    record.mission = value.mission
    record.events = [...record.events, value.event]
  }

  /** Missions visibles : `empty` et `missions-empty` présentent une file vide (maquette 32). */
  private visible(): MissionRecord[] {
    const mode = this.simulation.mode()
    if (mode === 'missions-empty') return []
    return visibleState(this.state, mode).missions.filter(
      ({ mission }) => mission.scope.kind !== 'personal' || mission.scope.owner === CURRENT_USER_ID,
    )
  }

  private find(slug: string): MissionRecord {
    const record = this.visible().find(({ mission }) => mission.slug === slug)
    if (record === undefined) throw new MissionNotFoundError(slug)
    return record
  }

  private freeSlug(title: string): string {
    const base = slugify(title).slice(0, 60).replace(/-+$/, '') || 'mission'
    const taken = new Set(this.state.missions.map(({ mission }) => mission.slug))
    let attempt = 1
    let slug = base
    while (taken.has(slug)) {
      attempt += 1
      slug = `${base}-${String(attempt)}`
    }
    return slug
  }

  private detail(record: MissionRecord): MissionDetail {
    const { mission } = record
    return {
      mission,
      promptTokens: promptTokens(mission.prompt),
      linkedContexts: this.linkedContexts(mission),
      events: record.events,
    }
  }

  private linkedContexts(mission: Mission): MissionLinkedContext[] {
    return mission.linkedContextIds.flatMap((id) => {
      const found = this.state.contexts.find(({ context }) => context.id === id)
      const published = found?.context.publishedVersion
      if (found === undefined || published === null || published === undefined) return []
      return [
        { id, slug: found.context.slug, title: found.context.title, version: published.number },
      ]
    })
  }
}
