/**
 * Cas d'usage des Workspaces (SPEC §7), partagés par REST et MCP.
 *
 * - Accès : seuls les membres (créateur, invités) ; un non-membre reçoit WorkspaceForbiddenError.
 * - Fermé : lecture seule (WorkspaceClosedError sur toute écriture).
 * - Toute écriture passe par le scan : secrets REMPLACÉS, injection suspecte signalée.
 * - Les invariants de concurrence (seq, claims) sont tenus par le store, dans une transaction.
 */
import { containsSecret } from '@context-hub/domain/context/scan.ts'
import { slugify } from '@context-hub/domain/context/slug.ts'
import { resourceUri } from '@context-hub/domain/context/uri.ts'
import {
  ClaimConflictError,
  DraftRejectedError,
  WorkspaceClosedError,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
  WorkspaceRuleError,
} from '@context-hub/domain/shared/errors.ts'
import {
  isSameSession,
  isSessionActive,
  UI_SESSION_LABEL,
} from '@context-hub/domain/sessions/session.ts'
import { normalizeRepoPath } from '@context-hub/domain/shared/repo.ts'
import { deriveWorkspaceStatus } from '@context-hub/domain/workspaces/activity.ts'
import { claimCovers, normalizeArea } from '@context-hub/domain/workspaces/claims.ts'
import { buildDelta, buildDigest, type Delta } from '@context-hub/domain/workspaces/digest.ts'
import { redactEntry } from '@context-hub/domain/workspaces/redaction.ts'
import {
  CLAIM_TTL_DEFAULT_MINUTES,
  DELTA_BUDGET_TOKENS,
  DIGEST_BUDGET_TOKENS,
  ENTRY_MAX_LENGTH,
  WORKSPACE_AUTO_CLOSE_MS,
  type AuthoredEntryKind,
  type CheckWriteResult,
  type Claim,
  type EntryPage,
  type HeartbeatResult,
  type JoinResult,
  type LinkedContext,
  type Participant,
  type ParticipantView,
  type SyncResult,
  type SystemSource,
  type Workspace,
  type WorkspaceDetail,
  type WorkspaceEntry,
  type WorkspaceList,
  type WorkspaceStatus,
} from '@context-hub/domain/workspaces/types.ts'

import type { ContextService } from '../contexts/ContextService.ts'
import type { Clock } from '../ports/Clock.ts'
import type { ContextDetail, ContextStore, PublishedSummary } from '../ports/ContextStore.ts'
import type { WorkspaceEvents } from '../ports/WorkspaceEvents.ts'
import type {
  NewEntry,
  ReleaseClaimResult,
  WorkspaceRecord,
  WorkspaceStore,
} from '../ports/WorkspaceStore.ts'
import { sessionKey, type SessionInput, type SessionKey } from '../sessionKey.ts'
import { toUserId, type Viewer } from '../viewer.ts'

/** Un blocage par hook n'est journalisé qu'une fois par (claim, session) sur cette fenêtre. */
export const BLOCKED_WRITE_DEDUP_MS = 5 * 60 * 1000
/** Entrées récentes lues pour construire le résumé. */
const DIGEST_RECENT_ENTRIES = 30
const DIGEST_DECISIONS = 5
const ENTRY_PAGE_MAX = 100

export type WorkspaceListFilter = WorkspaceStatus | 'all'

export interface CreateWorkspaceInput {
  readonly title: string
  readonly slug: string
  readonly goal: string
  readonly repos: readonly string[]
  readonly linkedContextIds: readonly string[]
}

export interface PostEntryInput extends SessionInput {
  readonly kind: AuthoredEntryKind
  readonly body: string
  readonly files: readonly string[]
}

export interface ClaimInput {
  readonly session: string
  /** Absent : le repo déclaré par la session à son join (pas de saisie par le modèle). */
  readonly repo?: string | undefined
  readonly area: string
  readonly ttlMinutes?: number | undefined
}

export interface ReleaseInput {
  readonly session: string
  /** Repo des zones à libérer ; null : tous les repos (`/context-hub:leave`). */
  readonly repo: string | null
  /** Zone à libérer ; absente : tous les claims de la session dans ce(s) repo(s). */
  readonly area?: string | undefined
}

export interface EntriesInput {
  readonly since?: number | undefined
  readonly before?: number | undefined
  readonly limit: number
}

export interface CheckWriteInput {
  readonly repo: string
  readonly path: string
  readonly session: string
}

export interface ProposeContextInput {
  readonly slug?: string | undefined
  readonly seq?: number | undefined
  readonly title: string
  readonly content: string
}

export interface WorkspaceServiceDependencies {
  readonly store: WorkspaceStore
  readonly contextStore: ContextStore
  readonly contexts: ContextService
  readonly clock: Clock
  readonly newId: (prefix: 'ws' | 'claim') => string
  readonly events: WorkspaceEvents
}

function systemEntry(source: SystemSource, body: string, files: readonly string[] = []): NewEntry {
  return {
    kind: 'system',
    body,
    files,
    author: { system: source },
    redactions: 0,
    suspicious: false,
  }
}

function releasedEntry(claim: Claim): NewEntry {
  return systemEntry(
    'claim',
    `${claim.holder.sessionLabel} a libéré ${claim.area} (${claim.repo}).`,
  )
}

function minutesUntil(iso: string, now: Date): number {
  return Math.max(0, Math.round((Date.parse(iso) - now.getTime()) / 60_000))
}

export class WorkspaceService {
  private readonly store: WorkspaceStore
  private readonly contextStore: ContextStore
  private readonly contexts: ContextService
  private readonly clock: Clock
  private readonly newId: (prefix: 'ws' | 'claim') => string
  private readonly events: WorkspaceEvents
  /** Dernier blocage journalisé par (claim, session) : évite d'inonder le journal. */
  private readonly lastBlockedWrite = new Map<string, number>()

  constructor(deps: WorkspaceServiceDependencies) {
    this.store = deps.store
    this.contextStore = deps.contextStore
    this.contexts = deps.contexts
    this.clock = deps.clock
    this.newId = deps.newId
    this.events = deps.events
  }

  // ── Lecture ────────────────────────────────────────────────────────────────

  async list(viewer: Viewer, filter: WorkspaceListFilter): Promise<WorkspaceList> {
    const now = this.clock.now()
    const rows = await this.store.listForMember(viewer.userId, now)
    const items = rows.map(({ workspace, participantsLastSeen, activeClaimCount }) => ({
      workspace,
      displayStatus: deriveWorkspaceStatus(workspace, now),
      activeSessions: participantsLastSeen.filter((at) => isSessionActive(at, now)).length,
      sessionCount: participantsLastSeen.length,
      claimCount: workspace.status === 'open' ? activeClaimCount : 0,
    }))
    const open = items.filter((item) => item.workspace.status === 'open').length
    return {
      items: filter === 'all' ? items : items.filter((item) => item.workspace.status === filter),
      counts: { open, closed: items.length - open, all: items.length },
    }
  }

  /** @throws WorkspaceNotFoundError, WorkspaceForbiddenError */
  async get(viewer: Viewer, slug: string): Promise<WorkspaceDetail> {
    return this.detail(viewer, await this.access(viewer, slug))
  }

  async claims(viewer: Viewer, slug: string): Promise<readonly Claim[]> {
    const { workspace } = await this.access(viewer, slug)
    return this.store.activeClaims(workspace.id, this.clock.now())
  }

  async readEntries(viewer: Viewer, slug: string, input: EntriesInput): Promise<EntryPage> {
    const { workspace } = await this.access(viewer, slug)
    const limit = Math.min(Math.max(1, input.limit), ENTRY_PAGE_MAX)
    const since = input.since ?? 1
    const slice = await this.store.readEntries(
      workspace.id,
      input.before === undefined ? { since, limit } : { before: input.before, limit },
    )
    const last = slice.entries.at(-1)
    return {
      entries: slice.entries,
      nextSeq: last === undefined ? since : last.seq + 1,
      hasMore: slice.hasMore,
    }
  }

  /** Entrées depuis `since`, plafonnées en tokens, au format « données attribuées ». */
  async delta(viewer: Viewer, slug: string, since: number, budgetTokens: number): Promise<Delta> {
    const { workspace } = await this.access(viewer, slug)
    const { entries } = await this.store.readEntries(workspace.id, { since, limit: ENTRY_PAGE_MAX })
    return buildDelta({ slug, since, entries }, budgetTokens)
  }

  /** Résumé plafonné (≈ 1 500 tokens) d'un workspace, et le curseur qui le suit. */
  async digest(viewer: Viewer, slug: string): Promise<{ text: string; cursor: number }> {
    return this.buildDigest(viewer, await this.access(viewer, slug))
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  /** @throws WorkspaceRuleError (slug pris, titre vide, secret, contexte inconnu) */
  async create(viewer: Viewer, input: CreateWorkspaceInput): Promise<WorkspaceDetail> {
    const title = input.title.trim()
    const goal = input.goal.trim()
    if (title === '') throw new WorkspaceRuleError('title-empty')
    if (containsSecret(title) || containsSecret(goal)) {
      throw new WorkspaceRuleError('secret-in-metadata')
    }
    const linkedContextIds = await this.visibleLinkedContexts(viewer, input.linkedContextIds)
    const now = this.clock.now()
    const at = now.toISOString()
    const name = await this.nameOf(viewer)
    const workspace: Workspace = {
      id: this.newId('ws'),
      slug: input.slug,
      title,
      goal,
      status: 'open',
      repos: [...new Set(input.repos)],
      linkedContextIds: linkedContextIds.map((context) => context.id),
      createdBy: viewer.userId,
      createdAt: at,
      lastActivityAt: at,
      closedAt: null,
    }
    const created = await this.store.create({
      workspace,
      creator: viewer.userId,
      entry: systemEntry('lifecycle', `Workspace créé par ${name}.`),
    })
    if (!created) throw new WorkspaceRuleError('slug-taken')
    return this.get(viewer, input.slug)
  }

  /** Ferme le workspace : claims libérés, lecture seule. @throws WorkspaceClosedError */
  async close(viewer: Viewer, slug: string): Promise<WorkspaceDetail> {
    const record = await this.writable(viewer, slug)
    const name = await this.nameOf(viewer)
    const entry = await this.store.close(
      record.workspace.id,
      viewer.userId,
      this.clock.now(),
      systemEntry('lifecycle', `Workspace fermé par ${name} : lecture seule, claims libérés.`),
    )
    if (entry === null) throw new WorkspaceClosedError(slug)
    await this.notify(record)
    return this.get(viewer, slug)
  }

  /** Tout membre peut inviter. @throws WorkspaceRuleError('unknown-user') */
  async inviteMember(viewer: Viewer, slug: string, userId: string): Promise<WorkspaceDetail> {
    const record = await this.writable(viewer, slug)
    const invitedName = await this.store.userName(userId)
    if (invitedName === null) throw new WorkspaceRuleError('unknown-user')
    const invited = toUserId(userId)
    if (!(await this.store.isMember(record.workspace.id, invited))) {
      const now = this.clock.now()
      await this.store.addMember(record.workspace.id, invited, now)
      const name = await this.nameOf(viewer)
      await this.append(record, systemEntry('lifecycle', `${name} a invité ${invitedName}.`), null)
    }
    return this.get(viewer, slug)
  }

  /** Ferme les workspaces sans activité depuis 30 jours et purge les claims expirés. */
  async closeIdleWorkspaces(): Promise<{ closed: number; purgedClaims: number }> {
    const now = this.clock.now()
    const purgedClaims = await this.store.purgeExpiredClaims(now, (claim) =>
      this.expiredEntry(claim),
    )
    const idle = await this.store.listIdleOpen(new Date(now.getTime() - WORKSPACE_AUTO_CLOSE_MS))
    let closed = 0
    for (const workspace of idle) {
      const entry = await this.store.close(
        workspace.id,
        null,
        now,
        systemEntry('lifecycle', 'Workspace fermé automatiquement après 30 jours sans activité.'),
      )
      if (entry !== null) closed += 1
    }
    return { closed, purgedClaims }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  /** Crée ou rafraîchit le participant et renvoie le résumé plafonné. @throws WorkspaceClosedError */
  async join(viewer: Viewer, slug: string, input: SessionInput): Promise<JoinResult> {
    const record = await this.writable(viewer, slug)
    const digest = await this.buildDigest(viewer, record)
    const { participant } = await this.store.touchParticipant(
      record.workspace.id,
      sessionKey(viewer, input),
      this.clock.now(),
      digest.cursor,
    )
    return {
      workspace: record.workspace,
      participant: this.view(participant),
      digest: digest.text,
      cursor: digest.cursor,
    }
  }

  /** `lastSeenAt`, curseur, et prolongation des claims de la session. */
  async heartbeat(
    viewer: Viewer,
    slug: string,
    input: SessionInput & { readonly cursor?: number | undefined },
  ): Promise<HeartbeatResult> {
    const record = await this.writable(viewer, slug)
    const { participant, extendedClaims } = await this.store.touchParticipant(
      record.workspace.id,
      sessionKey(viewer, input),
      this.clock.now(),
      input.cursor ?? null,
    )
    return { lastSeenAt: participant.lastSeenAt, extendedClaims }
  }

  /**
   * Hook UserPromptSubmit : delta plafonné (≈ 800 tokens) depuis `since`, et heartbeat de la session
   * avec le curseur qui suit le delta. Un seul aller-retour par prompt.
   */
  async sync(
    viewer: Viewer,
    slug: string,
    input: SessionInput & { readonly since: number },
  ): Promise<SyncResult> {
    const record = await this.writable(viewer, slug)
    const { entries } = await this.store.readEntries(record.workspace.id, {
      since: input.since,
      limit: ENTRY_PAGE_MAX,
    })
    const delta = buildDelta({ slug, since: input.since, entries }, DELTA_BUDGET_TOKENS)
    await this.store.touchParticipant(
      record.workspace.id,
      sessionKey(viewer, input),
      this.clock.now(),
      delta.nextSeq,
    )
    return {
      text: delta.text,
      count: delta.entries.length,
      nextSeq: delta.nextSeq,
      remaining: delta.remaining,
    }
  }

  /** Entrée d'une session ou d'un humain (`ui`), scannée. @throws WorkspaceRuleError, WorkspaceClosedError */
  async postEntry(viewer: Viewer, slug: string, input: PostEntryInput): Promise<WorkspaceEntry> {
    const record = await this.writable(viewer, slug)
    if (input.body.trim() === '') throw new WorkspaceRuleError('entry-empty')
    if (input.body.length > ENTRY_MAX_LENGTH) throw new WorkspaceRuleError('entry-too-long')
    const scanned = redactEntry(input.body, input.files)
    // Comme pour un claim : sans repo explicite, celui que la session a déclaré à son join (une
    // passation postée après `/context-hub:leave` garde ainsi son repo). L'UI n'en a pas.
    const repo =
      input.repo ??
      (input.session === UI_SESSION_LABEL
        ? null
        : await this.sessionRepo(viewer, record, input.session))
    const session = sessionKey(viewer, { session: input.session, repo })
    return this.append(
      record,
      {
        kind: input.kind,
        body: scanned.body,
        files: scanned.files,
        author: session,
        redactions: scanned.redactions,
        suspicious: scanned.suspicious,
      },
      session,
    )
  }

  // ── Claims ─────────────────────────────────────────────────────────────────

  /**
   * @throws ClaimConflictError (avec le claim existant), WorkspaceRuleError ('area-invalid',
   * 'repo-required', 'repo-not-in-workspace')
   */
  async acquireClaim(viewer: Viewer, slug: string, input: ClaimInput): Promise<Claim> {
    const record = await this.writable(viewer, slug)
    const normalized = normalizeArea(input.area)
    if ('violation' in normalized) throw new WorkspaceRuleError('area-invalid')
    const repo = await this.claimRepo(viewer, record, input.session, input.repo)
    const ttlMinutes = input.ttlMinutes ?? CLAIM_TTL_DEFAULT_MINUTES
    const session = sessionKey(viewer, { session: input.session, repo })
    const now = this.clock.now()
    const result = await this.store.acquireClaim({
      workspaceId: record.workspace.id,
      id: this.newId('claim'),
      session,
      repo,
      area: normalized.area,
      ttlMinutes,
      at: now,
      announce: (claim) =>
        systemEntry(
          'claim',
          `${claim.holder.sessionLabel} a réservé ${claim.area} (${claim.repo}) pour ${ttlMinutes} min.`,
        ),
      expired: (claim) => this.expiredEntry(claim),
    })
    switch (result.kind) {
      case 'closed':
        throw new WorkspaceClosedError(slug)
      case 'conflict':
        throw new ClaimConflictError(result.claim)
      case 'acquired':
      case 'renewed':
        await this.store.touchParticipant(record.workspace.id, session, now, null)
        if (result.kind === 'acquired') await this.notify(record)
        return result.claim
    }
  }

  /** Libération par la session détentrice (par zone, ou toutes ses zones du repo). */
  async releaseClaims(
    viewer: Viewer,
    slug: string,
    input: ReleaseInput,
  ): Promise<readonly Claim[]> {
    const record = await this.writable(viewer, slug)
    const session = sessionKey(viewer, { session: input.session, repo: input.repo })
    let area: string | null = null
    if (input.area !== undefined) {
      const normalized = normalizeArea(input.area)
      if ('violation' in normalized) throw new WorkspaceRuleError('area-invalid')
      area = normalized.area
    }
    const now = this.clock.now()
    const mine = (await this.store.activeClaims(record.workspace.id, now)).filter(
      (claim) =>
        isSameSession(claim.holder, session) &&
        (input.repo === null || claim.repo === input.repo) &&
        (area === null || claim.area === area),
    )
    if (area !== null && mine.length === 0) throw new WorkspaceRuleError('unknown-claim')
    const released: Claim[] = []
    for (const claim of mine) {
      const result = await this.store.releaseClaim({
        workspaceId: record.workspace.id,
        claimId: claim.id,
        holder: session,
        at: now,
        announce: (held) => releasedEntry(held),
      })
      if (result.kind === 'released') released.push(result.claim)
    }
    if (released.length > 0) await this.notify(record)
    return released
  }

  /** Libération par identifiant, par la session détentrice. @throws WorkspaceRuleError */
  async releaseClaim(
    viewer: Viewer,
    slug: string,
    claimId: string,
    session: string,
  ): Promise<Claim> {
    const record = await this.writable(viewer, slug)
    const result = await this.store.releaseClaim({
      workspaceId: record.workspace.id,
      claimId,
      holder: { userId: viewer.userId, sessionLabel: session, repo: null },
      at: this.clock.now(),
      announce: (held) => releasedEntry(held),
    })
    return this.releasedOrThrow(record, slug, result)
  }

  /**
   * Libération FORCÉE par un humain, depuis l'UI : l'entrée système prévient la session détentrice
   * (elle la reçoit dans son prochain delta).
   */
  async forceReleaseClaim(viewer: Viewer, slug: string, claimId: string): Promise<Claim> {
    const record = await this.writable(viewer, slug)
    const name = await this.nameOf(viewer)
    const result = await this.store.releaseClaim({
      workspaceId: record.workspace.id,
      claimId,
      holder: null,
      at: this.clock.now(),
      announce: (held) =>
        systemEntry(
          'claim',
          `${name} a libéré de force ${held.area} (${held.repo}), réservé par ${held.holder.sessionLabel}. ` +
            `${held.holder.sessionLabel} : vérifier l’état de la zone avant d’y écrire à nouveau.`,
        ),
    })
    return this.releasedOrThrow(record, slug, result)
  }

  /**
   * Le hook PreToolUse demande s'il peut écrire ce fichier. Lecture seule et indexée, sauf en cas de
   * blocage : une entrée `system/hook` est alors journalisée (au plus une fois par 5 min par claim et
   * session). Un workspace fermé n'a plus de claim : l'écriture est permise.
   */
  async checkWrite(
    viewer: Viewer,
    slug: string,
    input: CheckWriteInput,
  ): Promise<CheckWriteResult> {
    const record = await this.access(viewer, slug)
    const path = normalizeRepoPath(input.path)
    if (path === null) throw new WorkspaceRuleError('path-invalid')
    if (record.workspace.status === 'closed') return { allowed: true, holder: null, claim: null }
    const now = this.clock.now()
    const claims = await this.store.opposableClaims(
      record.workspace.id,
      input.repo,
      { userId: viewer.userId, sessionLabel: input.session },
      now,
    )
    const claim = claims.find((candidate) => claimCovers(candidate, input.repo, path))
    if (!claim) return { allowed: true, holder: null, claim: null }
    await this.recordBlockedWrite(record, claim, input.session, path, now)
    return { allowed: false, holder: claim.holder, claim }
  }

  // ── Passerelle vers les contextes ──────────────────────────────────────────

  /**
   * Crée un BROUILLON de contexte (portée personnelle) depuis une entrée ou un texte libre. Jamais
   * publié : seul un humain publie, après relecture et scan.
   */
  async proposeContext(viewer: Viewer, input: ProposeContextInput): Promise<ContextDetail> {
    let origin = 'une session Claude Code'
    if (input.slug !== undefined) {
      const { workspace } = await this.access(viewer, input.slug)
      origin = `le workspace ${workspace.slug}`
      if (input.seq !== undefined) {
        const { entries } = await this.store.readEntries(workspace.id, {
          since: input.seq,
          limit: 1,
        })
        if (entries[0]?.seq !== input.seq) throw new WorkspaceRuleError('unknown-entry')
        origin = `l’entrée #${input.seq} du workspace ${workspace.slug}`
      }
    }
    const leaf = slugify(input.title).slice(0, 60).replace(/-+$/, '') || 'proposition'
    const base = `propositions/${leaf}`
    const description = `Proposé depuis ${origin}, à relire avant publication.`.slice(0, 160)
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await this.contexts.create(viewer, {
          title: input.title.trim(),
          slug: attempt === 1 ? base : `${base}-${attempt}`,
          description,
          collectionId: null,
          tags: [],
          scope: { kind: 'personal', owner: viewer.userId },
          content: input.content,
          versionNote: `Proposé depuis ${origin}`,
        })
      } catch (error) {
        if (!(error instanceof DraftRejectedError) || !error.reasons.includes('slug-taken')) {
          throw error
        }
      }
    }
    throw new DraftRejectedError(['slug-taken'])
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  /**
   * Repo d'un claim. Absent, c'est celui que la session a déclaré à son join (déduit du remote git
   * par le plugin) : un repo retapé par le modèle peut être faux, et le claim
   * ne protégerait alors rien. Un repo hors du workspace (s'il en déclare) est refusé.
   */
  private async claimRepo(
    viewer: Viewer,
    record: WorkspaceRecord,
    sessionLabel: string,
    explicit: string | undefined,
  ): Promise<string> {
    const repo = explicit ?? (await this.sessionRepo(viewer, record, sessionLabel))
    if (repo === null) throw new WorkspaceRuleError('repo-required')
    const { repos } = record.workspace
    if (repos.length > 0 && !repos.includes(repo)) {
      throw new WorkspaceRuleError('repo-not-in-workspace')
    }
    return repo
  }

  /** Repo déclaré par la session à son join (participant), ou null. */
  private async sessionRepo(
    viewer: Viewer,
    record: WorkspaceRecord,
    sessionLabel: string,
  ): Promise<string | null> {
    const participant = (await this.store.participants(record.workspace.id)).find(
      ({ session }) => session.userId === viewer.userId && session.sessionLabel === sessionLabel,
    )
    return participant?.session.repo ?? null
  }

  /** @throws WorkspaceNotFoundError, WorkspaceForbiddenError */
  private async access(viewer: Viewer, slug: string): Promise<WorkspaceRecord> {
    const record = await this.store.findBySlug(slug)
    if (!record) throw new WorkspaceNotFoundError(slug)
    if (!(await this.store.isMember(record.workspace.id, viewer.userId))) {
      throw new WorkspaceForbiddenError(slug)
    }
    return record
  }

  /** Accès en écriture : membre, et workspace ouvert. */
  private async writable(viewer: Viewer, slug: string): Promise<WorkspaceRecord> {
    const record = await this.access(viewer, slug)
    if (record.workspace.status === 'closed') throw new WorkspaceClosedError(slug)
    return record
  }

  private async append(
    record: WorkspaceRecord,
    entry: NewEntry,
    session: SessionKey | null,
  ): Promise<WorkspaceEntry> {
    const now = this.clock.now()
    const result = await this.store.appendEntry(
      record.workspace.id,
      entry,
      now,
      session === null ? null : { session, at: now },
    )
    if (result.kind === 'closed') throw new WorkspaceClosedError(record.workspace.slug)
    await this.notify(record)
    return result.entry
  }

  private async notify(record: WorkspaceRecord): Promise<void> {
    this.events.emit({
      slug: record.workspace.slug,
      memberIds: await this.store.memberIds(record.workspace.id),
    })
  }

  private expiredEntry(claim: Claim): NewEntry {
    return systemEntry(
      'claim',
      `Le claim de ${claim.holder.sessionLabel} sur ${claim.area} (${claim.repo}) a expiré : la zone est libre.`,
    )
  }

  private async recordBlockedWrite(
    record: WorkspaceRecord,
    claim: Claim,
    session: string,
    path: string,
    now: Date,
  ): Promise<void> {
    const key = `${claim.id}\u0000${claim.workspaceId}\u0000${session}`
    const last = this.lastBlockedWrite.get(key)
    if (last !== undefined && now.getTime() - last < BLOCKED_WRITE_DEDUP_MS) return
    this.lastBlockedWrite.set(key, now.getTime())
    for (const [known, at] of this.lastBlockedWrite) {
      if (now.getTime() - at >= BLOCKED_WRITE_DEDUP_MS) this.lastBlockedWrite.delete(known)
    }
    await this.append(
      record,
      systemEntry(
        'hook',
        `Écriture bloquée : la session ${session} a tenté de modifier ${path}, dans une zone réservée par ` +
          `${claim.holder.sessionLabel} (${claim.area}, expire dans ${minutesUntil(claim.expiresAt, now)} min).`,
        [path],
      ),
      null,
    )
  }

  private async releasedOrThrow(
    record: WorkspaceRecord,
    slug: string,
    result: ReleaseClaimResult,
  ): Promise<Claim> {
    switch (result.kind) {
      case 'closed':
        throw new WorkspaceClosedError(slug)
      case 'not-found':
        throw new WorkspaceRuleError('unknown-claim')
      case 'not-holder':
        throw new WorkspaceRuleError('not-claim-holder')
      case 'released':
        await this.notify(record)
        return result.claim
    }
  }

  private view(participant: Participant): ParticipantView {
    return { ...participant, active: isSessionActive(participant.lastSeenAt, this.clock.now()) }
  }

  private async nameOf(viewer: Viewer): Promise<string> {
    return (await this.store.userName(viewer.userId)) ?? viewer.userId
  }

  /** Contextes publiés visibles du `viewer`, par identifiant. */
  private async publishedById(viewer: Viewer): Promise<Map<string, PublishedSummary>> {
    const summaries = await this.contextStore.listPublished(viewer)
    return new Map(summaries.map((summary) => [summary.id, summary]))
  }

  /** Contextes liés publiés et visibles, dans l'ordre demandé. @throws WorkspaceRuleError */
  private async visibleLinkedContexts(
    viewer: Viewer,
    ids: readonly string[],
  ): Promise<PublishedSummary[]> {
    if (ids.length === 0) return []
    const published = await this.publishedById(viewer)
    return [...new Set(ids)].map((id) => {
      const summary = published.get(id)
      if (!summary) throw new WorkspaceRuleError('unknown-context')
      return summary
    })
  }

  /** Contextes liés encore publiés et visibles (un contexte archivé disparaît du détail). */
  private async linkedContexts(viewer: Viewer, workspace: Workspace): Promise<LinkedContext[]> {
    if (workspace.linkedContextIds.length === 0) return []
    const published = await this.publishedById(viewer)
    return workspace.linkedContextIds.flatMap((id) => {
      const summary = published.get(id)
      return summary
        ? [{ id, slug: summary.slug, title: summary.title, version: summary.version }]
        : []
    })
  }

  private async detail(viewer: Viewer, record: WorkspaceRecord): Promise<WorkspaceDetail> {
    const { workspace } = record
    const now = this.clock.now()
    const [members, participants, claims, linkedContexts, entryCounts] = await Promise.all([
      this.store.listMembers(workspace.id),
      this.store.participants(workspace.id),
      this.store.activeClaims(workspace.id, now),
      this.linkedContexts(viewer, workspace),
      this.store.entryCounts(workspace.id),
    ])
    return {
      workspace,
      displayStatus: deriveWorkspaceStatus(workspace, now),
      createdByName: record.createdByName,
      closedByName: record.closedByName,
      members,
      participants: participants.map((participant) => this.view(participant)),
      claims,
      linkedContexts,
      entryCount: Object.values(entryCounts).reduce((sum, value) => sum + value, 0),
      entryCounts,
    }
  }

  private async buildDigest(
    viewer: Viewer,
    record: WorkspaceRecord,
  ): Promise<{ text: string; cursor: number }> {
    const { workspace } = record
    const now = this.clock.now()
    const [recentEntries, decisions, activeClaims, linkedContexts] = await Promise.all([
      this.store.latestEntries(workspace.id, null, DIGEST_RECENT_ENTRIES),
      this.store.latestEntries(workspace.id, 'decision', DIGEST_DECISIONS),
      this.store.activeClaims(workspace.id, now),
      this.linkedContexts(viewer, workspace),
    ])
    const cursor = (recentEntries.at(-1)?.seq ?? 0) + 1
    return buildDigest(
      {
        slug: workspace.slug,
        title: workspace.title,
        goal: workspace.goal,
        status: workspace.status,
        createdByName: record.createdByName,
        linkedContexts: linkedContexts.map((context) => ({
          title: context.title,
          uri: resourceUri(context),
          version: context.version,
        })),
        activeClaims,
        recentEntries,
        decisions,
        cursor,
      },
      DIGEST_BUDGET_TOKENS,
    )
  }
}
