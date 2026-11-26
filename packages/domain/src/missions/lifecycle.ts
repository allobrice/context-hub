/**
 * Cycle de vie d'une mission (SPEC §8.2), en fonctions pures : une commande, appliquée par un acteur
 * à un instant donné, produit la mission suivante et l'événement à journaliser, ou un refus typé.
 *
 * La table `MISSION_TRANSITIONS` dit quels statuts et quels acteurs chaque commande accepte ; elle
 * sert à `transition` ET aux tests (toutes les cases interdites en sont dérivées).
 */
import type { Scope } from '../context/types.ts'
import { isLeaseExpired, leaseUntil } from '../sessions/lease.ts'
import { isSameSession, type SessionRef } from '../sessions/session.ts'
import { err, ok, type Result } from '../shared/result.ts'
import {
  MISSION_EXPIRY_MS,
  MISSION_RESERVATION_MINUTES,
  type ActorKind,
  type DraftMission,
  type InProgressMission,
  type Mission,
  type MissionActor,
  type MissionCore,
  type MissionEvent,
  type MissionEventActor,
  type MissionEventType,
  type MissionResult,
  type MissionStatus,
  type Priority,
  type ReadyMission,
} from './types.ts'

export type MissionCommand =
  | { readonly type: 'validate' }
  | { readonly type: 'reject'; readonly reason: string | null }
  | { readonly type: 'take' }
  | { readonly type: 'release' }
  | { readonly type: 'expireClaim' }
  | { readonly type: 'freshness'; readonly changedFiles: readonly string[] }
  | { readonly type: 'complete'; readonly result: MissionResult }
  | { readonly type: 'drop'; readonly reason: string }
  | { readonly type: 'expire' }
  | { readonly type: 'reopen' }

export type MissionCommandType = MissionCommand['type']
export const MISSION_COMMAND_TYPES = [
  'validate',
  'reject',
  'take',
  'release',
  'expireClaim',
  'freshness',
  'complete',
  'drop',
  'expire',
  'reopen',
] as const satisfies readonly MissionCommandType[]

export interface TransitionRule {
  readonly from: readonly MissionStatus[]
  readonly actors: readonly ActorKind[]
}

/** SPEC §8.2. `expireClaim` : réservation échue (job, ou au début d'un `take`). */
export const MISSION_TRANSITIONS = {
  validate: { from: ['draft'], actors: ['human'] },
  reject: { from: ['draft'], actors: ['human'] },
  take: { from: ['ready'], actors: ['session'] },
  release: { from: ['in_progress'], actors: ['session', 'human'] },
  expireClaim: { from: ['in_progress'], actors: ['job'] },
  freshness: { from: ['in_progress'], actors: ['session'] },
  complete: { from: ['in_progress'], actors: ['session'] },
  drop: { from: ['ready', 'in_progress'], actors: ['session', 'human'] },
  expire: { from: ['draft', 'ready'], actors: ['job'] },
  reopen: { from: ['done', 'dropped'], actors: ['human'] },
} as const satisfies Record<MissionCommandType, TransitionRule>

export type TransitionRejection =
  /** La commande ne s'applique pas au statut courant. */
  | 'invalid-status'
  /** Cet acteur ne peut pas donner cette commande. */
  | 'actor-not-allowed'
  /** La session n'est pas celle qui a pris la mission. */
  | 'not-holder'
  /** La réservation de la session est échue : elle n'est plus opposable. */
  | 'claim-expired'
  /** Échéance pas encore atteinte (expiration, réservation échue). */
  | 'not-due'
  | 'reason-required'
  | 'summary-required'

export const TRANSITION_REJECTIONS = [
  'invalid-status',
  'actor-not-allowed',
  'not-holder',
  'claim-expired',
  'not-due',
  'reason-required',
  'summary-required',
] as const satisfies readonly TransitionRejection[]

export interface TransitionError {
  readonly rejection: TransitionRejection
  readonly status: MissionStatus
  /** `renew` : prolongation (heartbeat) ; `edit` : « Modifier », hors du cycle de vie. */
  readonly command: MissionCommandType | 'renew' | 'edit'
}

export type Transition =
  | { readonly kind: 'updated'; readonly mission: Mission; readonly event: MissionEvent }
  /** Rejet d'une mission à valider : elle est supprimée, l'événement reste. */
  | { readonly kind: 'deleted'; readonly event: MissionEvent }

export type CreatorActor = Exclude<MissionActor, { readonly kind: 'job' }>

/** Données d'une nouvelle mission, déjà validées (gabarit, scan, tailles) par le cas d'usage. */
export type NewMission = Omit<MissionCore, 'createdAt' | 'expiresAt' | 'updatedAt'>

// ── Création ─────────────────────────────────────────────────────────────────

/**
 * Créée par une session en portée équipe ou projet : validation humaine obligatoire (`draft`).
 * Portée personnelle, ou créée par un humain : directement prête.
 */
export function initialStatus(scope: Scope, creator: ActorKind): 'draft' | 'ready' {
  return creator === 'session' && scope.kind !== 'personal' ? 'draft' : 'ready'
}

export function createMission(
  input: NewMission,
  creator: CreatorActor,
  now: Date,
): { readonly mission: DraftMission | ReadyMission; readonly event: MissionEvent } {
  const at = now.toISOString()
  const core: MissionCore = {
    ...input,
    createdAt: at,
    expiresAt: new Date(now.getTime() + MISSION_EXPIRY_MS).toISOString(),
    updatedAt: at,
  }
  const open = { claim: null, result: null, dropReason: null, closedAt: null } as const
  const mission: DraftMission | ReadyMission =
    initialStatus(input.scope, creator.kind) === 'draft'
      ? { ...core, ...open, status: 'draft', validation: null }
      : { ...core, ...open, status: 'ready', validation: null }
  return { mission, event: eventOf(mission, creator, now, 'created', mission.status) }
}

// ── Transitions ──────────────────────────────────────────────────────────────

/**
 * Applique `command` à `mission`. Le statut et l'acteur sont vérifiés par la table ; chaque commande
 * vérifie ensuite ses propres conditions (détenteur, échéance, raison, résumé).
 */
export function transition(
  mission: Mission,
  command: MissionCommand,
  actor: MissionActor,
  now: Date,
): Result<Transition, TransitionError> {
  const rule: TransitionRule = MISSION_TRANSITIONS[command.type]
  const refuse = (rejection: TransitionRejection) =>
    err<TransitionError>({ rejection, status: mission.status, command: command.type })
  if (!rule.from.includes(mission.status)) return refuse('invalid-status')
  if (!rule.actors.includes(actor.kind)) return refuse('actor-not-allowed')

  const at = now.toISOString()
  const updated = (next: Mission, type: MissionEventType, detail: string | null = null) =>
    ok<Transition>({
      kind: 'updated',
      mission: next,
      event: eventOf(next, actor, now, type, detail),
    })

  // La table a déjà vérifié le statut et l'acteur : les gardes `status` / `actor.kind` ci-dessous ne
  // servent qu'à rétrécir les types pour TypeScript (elles ne refusent jamais rien de plus).
  switch (command.type) {
    case 'validate':
      if (mission.status !== 'draft' || actor.kind !== 'human') return refuse('invalid-status')
      return updated(
        { ...mission, status: 'ready', validation: { by: actor.userId, at }, updatedAt: at },
        'validated',
      )
    case 'reject':
      return ok({
        kind: 'deleted',
        event: eventOf(mission, actor, now, 'rejected', blankToNull(command.reason)),
      })
    case 'take': {
      if (mission.status !== 'ready' || actor.kind !== 'session') return refuse('invalid-status')
      const claim = {
        session: actor.session,
        acquiredAt: at,
        expiresAt: leaseUntil(now, MISSION_RESERVATION_MINUTES),
      }
      return updated({ ...mission, status: 'in_progress', claim, updatedAt: at }, 'taken')
    }
    case 'release': {
      if (mission.status !== 'in_progress') return refuse('invalid-status')
      const holding = checkHolder(mission, actor, now)
      if (holding !== null) return refuse(holding)
      return updated(toReady(mission, at), 'released', actor.kind === 'human' ? 'forcée' : null)
    }
    case 'expireClaim':
      if (mission.status !== 'in_progress') return refuse('invalid-status')
      if (!isLeaseExpired(mission.claim, now)) return refuse('not-due')
      return updated(toReady(mission, at), 'released', 'réservation expirée')
    case 'freshness': {
      if (mission.status !== 'in_progress' || actor.kind !== 'session') {
        return refuse('invalid-status')
      }
      const holding = checkHolder(mission, actor, now)
      if (holding !== null) return refuse(holding)
      // Seuls les fichiers cités par la mission comptent : un chemin hors mission est ignoré
      // (sinon la file et le détail divergent, et une session pourrait afficher n'importe quoi).
      const cited = new Set(mission.codeRef.files)
      const changedFiles = [...new Set(command.changedFiles)].filter((file) => cited.has(file))
      const freshness = { checkedAt: at, changedFiles, checkedBy: actor.session }
      return updated(
        { ...renewed(mission, now), freshness, updatedAt: at },
        'freshness',
        `${String(changedFiles.length)} fichier(s) modifié(s)`,
      )
    }
    case 'complete': {
      if (mission.status !== 'in_progress') return refuse('invalid-status')
      const holding = checkHolder(mission, actor, now)
      if (holding !== null) return refuse(holding)
      if (command.result.summary.trim() === '') return refuse('summary-required')
      return updated(
        {
          ...mission,
          status: 'done',
          claim: null,
          result: command.result,
          closedAt: at,
          updatedAt: at,
        },
        'completed',
      )
    }
    case 'drop': {
      if (mission.status !== 'ready' && mission.status !== 'in_progress') {
        return refuse('invalid-status')
      }
      // Une session n'abandonne que la mission qu'elle tient (jeton exigé par le store) : sinon un
      // prompt injecté pourrait vider la file de l'équipe. Une mission prête s'abandonne depuis l'UI.
      if (mission.status === 'ready' && actor.kind === 'session') return refuse('not-holder')
      if (mission.status === 'in_progress') {
        const holding = checkHolder(mission, actor, now)
        if (holding !== null) return refuse(holding)
      }
      const reason = command.reason.trim()
      if (reason === '') return refuse('reason-required')
      return updated(
        {
          ...mission,
          status: 'dropped',
          claim: null,
          dropReason: reason,
          closedAt: at,
          updatedAt: at,
        },
        'dropped',
        reason,
      )
    }
    case 'expire':
      if (mission.status !== 'draft' && mission.status !== 'ready') return refuse('invalid-status')
      if (!isLeaseExpired(mission, now)) return refuse('not-due')
      return updated({ ...mission, status: 'expired', closedAt: at, updatedAt: at }, 'expired')
    case 'reopen':
      if (mission.status !== 'done' && mission.status !== 'dropped') return refuse('invalid-status')
      return updated(
        {
          ...mission,
          status: 'ready',
          result: null,
          dropReason: null,
          closedAt: null,
          expiresAt: new Date(now.getTime() + MISSION_EXPIRY_MS).toISOString(),
          updatedAt: at,
        },
        'reopened',
      )
  }
}

/**
 * Prolonge la réservation de la session qui tient la mission (heartbeat, appel mission). Pas
 * d'événement : le journal ne garde que les changements d'état.
 */
export function renewClaim(
  mission: Mission,
  session: SessionRef,
  now: Date,
): Result<InProgressMission, TransitionError> {
  const refuse = (rejection: TransitionRejection) =>
    err<TransitionError>({ rejection, status: mission.status, command: 'renew' })
  if (mission.status !== 'in_progress') return refuse('invalid-status')
  const holding = checkHolder(mission, { kind: 'session', session }, now)
  if (holding !== null) return refuse(holding)
  return ok(renewed(mission, now))
}

// ── Aides ────────────────────────────────────────────────────────────────────

/** Une session n'agit sur une mission en cours que si elle la tient, et tant que sa prise vaut. */
function checkHolder(
  mission: InProgressMission,
  actor: MissionActor,
  now: Date,
): TransitionRejection | null {
  if (actor.kind !== 'session') return null
  if (!isSameSession(mission.claim.session, actor.session)) return 'not-holder'
  return isLeaseExpired(mission.claim, now) ? 'claim-expired' : null
}

function renewed(mission: InProgressMission, now: Date): InProgressMission {
  return {
    ...mission,
    claim: { ...mission.claim, expiresAt: leaseUntil(now, MISSION_RESERVATION_MINUTES) },
  }
}

function toReady(mission: InProgressMission, at: string): ReadyMission {
  return { ...mission, status: 'ready', claim: null, updatedAt: at }
}

/** Champs que « Modifier » peut changer (mission à valider ou prête). */
export interface MissionEdit {
  readonly title: string
  readonly summary: string
  readonly prompt: string
  readonly priority: Priority
  readonly tags: readonly string[]
}

const EDITED_FIELDS = [
  ['title', 'titre'],
  ['summary', 'résumé'],
  ['prompt', 'prompt'],
  ['priority', 'priorité'],
  ['tags', 'tags'],
] as const

/**
 * Événement « Modifiée par … » : trace de ce qu'un humain a changé avant de valider. Détail = champs
 * réellement changés (« prompt, priorité ») ; null si rien ne change.
 */
export function editEvent(
  before: Mission,
  after: MissionEdit,
  userId: string,
  now: Date,
): MissionEvent | null {
  const changed = EDITED_FIELDS.filter(([field]) =>
    field === 'tags'
      ? before.tags.join('\n') !== after.tags.join('\n')
      : before[field] !== after[field],
  ).map(([, label]) => label)
  if (changed.length === 0) return null
  return eventOf(
    { ...before, title: after.title },
    { kind: 'human', userId },
    now,
    'edited',
    changed.join(', '),
  )
}

function eventActorOf(actor: MissionActor): MissionEventActor {
  switch (actor.kind) {
    case 'session':
      return actor.session
    case 'human':
      return { userId: actor.userId }
    case 'job':
      return { system: 'job' }
  }
}

function eventOf(
  mission: Pick<Mission, 'id' | 'slug' | 'title'>,
  actor: MissionActor,
  now: Date,
  type: MissionEventType,
  detail: string | null,
): MissionEvent {
  return {
    missionId: mission.id,
    missionSlug: mission.slug,
    missionTitle: mission.title,
    at: now.toISOString(),
    actor: eventActorOf(actor),
    type,
    detail,
  }
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
