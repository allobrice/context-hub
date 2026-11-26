import type { Clock } from '../../application/ports/Clock.ts'
import type {
  CreateWorkspaceCommand,
  EntryQuery,
  WorkspaceListFilter,
  WorkspaceRepository,
} from '../../application/ports/WorkspaceRepository.ts'
import {
  WorkspaceClosedError,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
  WorkspaceRuleError,
} from '@context-hub/domain/shared/errors.ts'
import { containsSecret } from '@context-hub/domain/context/scan.ts'
import {
  isSessionActive,
  UI_SESSION_LABEL,
  type SessionRef,
} from '@context-hub/domain/sessions/session.ts'
import { deriveWorkspaceStatus } from '@context-hub/domain/workspaces/activity.ts'
import { isClaimExpired } from '@context-hub/domain/workspaces/claims.ts'
import { redactEntry } from '@context-hub/domain/workspaces/redaction.ts'
import {
  ENTRY_KINDS,
  ENTRY_MAX_LENGTH,
  WORKSPACE_SLUG_PATTERN,
  type AuthoredEntryKind,
  type EntryCounts,
  type EntryKind,
  type EntryPage,
  type LinkedContext,
  type SystemSource,
  type WorkspaceDetail,
  type WorkspaceEntry,
  type WorkspaceList,
} from '@context-hub/domain/workspaces/types.ts'
import { DEMO_USERS } from '@context-hub/domain/fixtures/workspaces.ts'
import { visibleState, type InMemoryState, type WorkspaceRecord } from './InMemoryStore.ts'
import type { MockMode } from './mockMode.ts'
import {
  simulateMutation,
  simulatePrimary,
  simulateSecondary,
  type SimulationOptions,
} from './simulation.ts'

/** Utilisateur de la démo (celui du jeton de dev côté serveur). */
const CURRENT_USER = DEMO_USERS.brice

function nameOf(userId: string): string {
  return Object.values(DEMO_USERS).find((user) => user.id === userId)?.name ?? userId
}

function emptyCounts(): Record<EntryKind, number> {
  return { note: 0, decision: 0, question: 0, handoff: 0, status: 0, system: 0 }
}

/**
 * Workspaces en mémoire : joue le rôle du serveur (appartenance, fermeture, scan des entrées,
 * numérotation sans trou). Modes : `ws-empty` (aucun workspace), `ws-closed` (tout workspace est
 * présenté fermé), `ws-forbidden` (accès refusé au détail).
 */
export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
    private readonly clock: Clock,
  ) {}

  list(filter: WorkspaceListFilter): Promise<WorkspaceList> {
    return simulatePrimary(this.simulation, () => {
      const now = this.clock.now()
      const items = this.records()
        .map((record) => this.view(record))
        .sort((a, b) => b.workspace.lastActivityAt.localeCompare(a.workspace.lastActivityAt))
        .map((record) => ({
          workspace: record.workspace,
          displayStatus: deriveWorkspaceStatus(record.workspace, now),
          activeSessions: record.participants.filter((p) => isSessionActive(p.lastSeenAt, now))
            .length,
          sessionCount: record.participants.length,
          claimCount: this.activeClaims(record).length,
        }))
      const open = items.filter((item) => item.workspace.status === 'open').length
      return {
        items: filter === 'all' ? items : items.filter((item) => item.workspace.status === filter),
        counts: { open, closed: items.length - open, all: items.length },
      }
    })
  }

  get(slug: string): Promise<WorkspaceDetail> {
    return simulatePrimary(this.simulation, () => this.detail(this.access(slug)))
  }

  create(command: CreateWorkspaceCommand): Promise<WorkspaceDetail> {
    return simulateMutation(this.simulation, () => {
      const title = command.title.trim()
      if (title === '') throw new WorkspaceRuleError('title-empty')
      if (!WORKSPACE_SLUG_PATTERN.test(command.slug)) throw new WorkspaceRuleError('slug-invalid')
      if (containsSecret(title) || containsSecret(command.goal)) {
        throw new WorkspaceRuleError('secret-in-metadata')
      }
      if (this.state.workspaces.some((record) => record.workspace.slug === command.slug)) {
        throw new WorkspaceRuleError('slug-taken')
      }
      const linkedContextIds = command.linkedContextIds.map((id) => {
        const context = this.state.contexts.find((record) => record.context.id === id)?.context
        if (context?.status !== 'published') throw new WorkspaceRuleError('unknown-context')
        return context.id
      })
      const at = this.clock.now().toISOString()
      const record: WorkspaceRecord = {
        workspace: {
          id: `ws-${command.slug}`,
          slug: command.slug,
          title,
          goal: command.goal.trim(),
          status: 'open',
          repos: [...new Set(command.repos)],
          linkedContextIds,
          createdBy: CURRENT_USER.id,
          createdAt: at,
          lastActivityAt: at,
          closedAt: null,
        },
        closedBy: null,
        members: [{ userId: CURRENT_USER.id, role: 'creator', addedAt: at }],
        participants: [],
        claims: [],
        entries: [],
      }
      this.state.workspaces.push(record)
      this.appendSystem(record, 'lifecycle', `Workspace créé par ${CURRENT_USER.name}.`)
      return this.detail(record)
    })
  }

  close(slug: string): Promise<WorkspaceDetail> {
    return simulateMutation(this.simulation, () => {
      const record = this.writable(slug)
      this.appendSystem(
        record,
        'lifecycle',
        `Workspace fermé par ${CURRENT_USER.name} : lecture seule, claims libérés.`,
      )
      record.workspace = {
        ...record.workspace,
        status: 'closed',
        closedAt: this.clock.now().toISOString(),
      }
      record.closedBy = CURRENT_USER.id
      record.claims = []
      return this.detail(record)
    })
  }

  readEntries(slug: string, query: EntryQuery): Promise<EntryPage> {
    return simulateSecondary(this.simulation, () => {
      const { entries } = this.access(slug)
      const limit = Math.min(Math.max(1, query.limit), 100)
      if ('before' in query) {
        const older = entries.filter((entry) => entry.seq < query.before)
        const page = older.slice(-limit)
        const last = page.at(-1)
        return {
          entries: page,
          nextSeq: last === undefined ? query.before : last.seq + 1,
          hasMore: older.length > page.length,
        }
      }
      const newer = entries.filter((entry) => entry.seq >= query.since)
      const page = newer.slice(0, limit)
      const last = page.at(-1)
      return {
        entries: page,
        nextSeq: last === undefined ? query.since : last.seq + 1,
        hasMore: newer.length > page.length,
      }
    })
  }

  postEntry(
    slug: string,
    { kind, body }: { readonly kind: AuthoredEntryKind; readonly body: string },
  ): Promise<WorkspaceEntry> {
    return simulateMutation(this.simulation, () => {
      const record = this.writable(slug)
      if (body.trim() === '') throw new WorkspaceRuleError('entry-empty')
      if (body.length > ENTRY_MAX_LENGTH) throw new WorkspaceRuleError('entry-too-long')
      const scanned = redactEntry(body)
      const author: SessionRef = {
        userId: CURRENT_USER.id,
        userName: CURRENT_USER.name,
        sessionLabel: UI_SESSION_LABEL,
        repo: null,
      }
      return this.append(record, {
        kind,
        body: scanned.body,
        files: [],
        author,
        redactions: scanned.redactions,
        suspicious: scanned.suspicious,
      })
    })
  }

  forceReleaseClaim(slug: string, claimId: string): Promise<void> {
    return simulateMutation(this.simulation, () => {
      const record = this.writable(slug)
      const claim = record.claims.find((candidate) => candidate.id === claimId)
      if (!claim) throw new WorkspaceRuleError('unknown-claim')
      record.claims = record.claims.filter((candidate) => candidate.id !== claimId)
      const holder = claim.holder.sessionLabel
      this.appendSystem(
        record,
        'claim',
        `${CURRENT_USER.name} a libéré de force ${claim.area} (${claim.repo}), réservé par ${holder}. ` +
          `${holder} : vérifier l’état de la zone avant d’y écrire à nouveau.`,
      )
    })
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  private mode(): MockMode {
    return this.simulation.mode()
  }

  private records(): WorkspaceRecord[] {
    return this.mode() === 'ws-empty' ? [] : visibleState(this.state, this.mode()).workspaces
  }

  /** `ws-closed` : tout workspace est présenté fermé (maquette 28), sans toucher à l'état. */
  private view(record: WorkspaceRecord): WorkspaceRecord {
    if (this.mode() !== 'ws-closed' || record.workspace.status === 'closed') return record
    return {
      ...record,
      workspace: {
        ...record.workspace,
        status: 'closed',
        closedAt: this.clock.now().toISOString(),
      },
      closedBy: CURRENT_USER.id,
      claims: [],
    }
  }

  /** @throws WorkspaceNotFoundError, WorkspaceForbiddenError */
  private access(slug: string): WorkspaceRecord {
    const record = this.records().find((candidate) => candidate.workspace.slug === slug)
    if (!record) throw new WorkspaceNotFoundError(slug)
    if (
      this.mode() === 'ws-forbidden' ||
      !record.members.some((member) => member.userId === CURRENT_USER.id)
    ) {
      throw new WorkspaceForbiddenError(slug)
    }
    return this.view(record)
  }

  private writable(slug: string): WorkspaceRecord {
    const record = this.access(slug)
    if (record.workspace.status === 'closed') throw new WorkspaceClosedError(slug)
    return record
  }

  private activeClaims(record: WorkspaceRecord) {
    const now = this.clock.now()
    return record.workspace.status === 'closed'
      ? []
      : record.claims.filter((claim) => !isClaimExpired(claim, now))
  }

  private append(
    record: WorkspaceRecord,
    entry: Omit<WorkspaceEntry, 'workspaceId' | 'seq' | 'createdAt'>,
  ): WorkspaceEntry {
    const createdAt = this.clock.now().toISOString()
    const created: WorkspaceEntry = {
      ...entry,
      workspaceId: record.workspace.id,
      seq: record.entries.length + 1,
      createdAt,
    }
    record.entries.push(created)
    record.workspace = { ...record.workspace, lastActivityAt: createdAt }
    return created
  }

  private appendSystem(record: WorkspaceRecord, system: SystemSource, body: string): void {
    this.append(record, {
      kind: 'system',
      body,
      files: [],
      author: { system },
      redactions: 0,
      suspicious: false,
    })
  }

  private linkedContexts(record: WorkspaceRecord): LinkedContext[] {
    return record.workspace.linkedContextIds.flatMap((id) => {
      const context = this.state.contexts.find((candidate) => candidate.context.id === id)?.context
      const version = context?.publishedVersion?.number
      return context && version !== undefined && context.status === 'published'
        ? [{ id: context.id, slug: context.slug, title: context.title, version }]
        : []
    })
  }

  private detail(record: WorkspaceRecord): WorkspaceDetail {
    const now = this.clock.now()
    const counts = emptyCounts()
    for (const entry of record.entries) counts[entry.kind] += 1
    const entryCounts: EntryCounts = counts
    return {
      workspace: record.workspace,
      displayStatus: deriveWorkspaceStatus(record.workspace, now),
      createdByName: nameOf(record.workspace.createdBy),
      closedByName: record.closedBy === null ? null : nameOf(record.closedBy),
      members: record.members.map((member) => ({ ...member, name: nameOf(member.userId) })),
      participants: [...record.participants]
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
        .map((participant) => ({
          ...participant,
          active: isSessionActive(participant.lastSeenAt, now),
        })),
      claims: this.activeClaims(record),
      linkedContexts: this.linkedContexts(record),
      entryCount: ENTRY_KINDS.reduce((sum, kind) => sum + entryCounts[kind], 0),
      entryCounts,
    }
  }
}
