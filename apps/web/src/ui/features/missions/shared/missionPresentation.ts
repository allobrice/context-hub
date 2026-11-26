/**
 * Libellés et tons des écrans Missions (SPEC §8.4, maquettes 31–39) : fonctions pures, horloge
 * injectée. Partagés par la file et le détail.
 */
import type { Scope } from '@context-hub/domain/context/types.ts'
import type {
  Mission,
  MissionEvent,
  MissionQueueFilter,
  MissionStatus,
  MissionStatusCounts,
  MissionSummary,
  Priority,
} from '@context-hub/domain/missions/types.ts'

import type { BadgeTone } from '../../../components/Badge/Badge.tsx'
import { formatRelativeDate, plural } from '../../../lib/format.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

export const MISSION_STATUS_LABELS: Readonly<Record<MissionStatus, string>> = {
  draft: 'À valider',
  ready: 'Prête',
  in_progress: 'En cours',
  done: 'Terminée',
  dropped: 'Abandonnée',
  expired: 'Expirée',
}

/** Tons des badges (maquettes : b-draft, b-arch, b-acc, b-pub). */
export const MISSION_STATUS_TONES: Readonly<Record<MissionStatus, BadgeTone>> = {
  draft: 'warn',
  ready: 'neutral',
  in_progress: 'accent',
  done: 'ok',
  dropped: 'neutral',
  expired: 'neutral',
}

export const MISSION_FILTER_LABELS: Readonly<Record<MissionQueueFilter, string>> = {
  todo: 'À traiter',
  to_validate: 'À valider',
  ready: 'Prêtes',
  archived: 'Archivées',
  all: 'Toutes',
}

export function scopeLabel(scope: Scope): string {
  switch (scope.kind) {
    case 'personal':
      return 'Portée personnelle'
    case 'project':
      return 'Portée projet'
    case 'team':
      return 'Portée équipe'
  }
}

/** P1 en danger (maquette 31), les autres neutres. */
export function priorityTone(priority: Priority): 'danger' | 'neutral' {
  return priority === 'P1' ? 'danger' : 'neutral'
}

/** Durée écoulée compacte : « 18 min », « 3 h », « 2 j ». */
export function elapsedLabel(iso: string, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - Date.parse(iso))
  if (elapsed < HOUR) return `${String(Math.max(1, Math.floor(elapsed / MINUTE)))} min`
  if (elapsed < DAY) return `${String(Math.floor(elapsed / HOUR))} h`
  return `${String(Math.floor(elapsed / DAY))} j`
}

/** Code d'origine : à jour, ou N fichiers modifiés depuis la création (dernier contrôle connu). */
export function codeRefState(mission: Pick<Mission, 'codeRef' | 'freshness'>): {
  readonly tone: 'ok' | 'warn'
  readonly label: string
} {
  const changed = mission.freshness?.changedFiles.length ?? 0
  return changed === 0
    ? { tone: 'ok', label: `À jour (${mission.codeRef.commit})` }
    : { tone: 'warn', label: plural(changed, 'fichier modifié', 'fichiers modifiés') }
}

/**
 * Sous-ligne du statut dans la file : qui, depuis quand, ou ce qui est attendu (SPEC §8.4).
 * `MissionSummary` n'est pas discriminée par statut : les champs propres à un statut sont testés.
 */
export function statusSubline(mission: MissionSummary, now: Date): string {
  const closed = (verb: string) =>
    mission.closedAt === null ? verb : `${verb} ${formatRelativeDate(mission.closedAt, now)}`
  switch (mission.status) {
    case 'draft':
      return mission.scope.kind === 'personal'
        ? 'validation requise'
        : `${scopeLabel(mission.scope).toLowerCase()} : validation requise`
    case 'ready':
      return (mission.freshness?.changedFiles.length ?? 0) > 0
        ? 'à revérifier avant de prendre'
        : 'en attente d’une session'
    case 'in_progress':
      return mission.claim === null
        ? 'en cours'
        : `${mission.claim.session.sessionLabel} · réservée ${elapsedLabel(mission.claim.acquiredAt, now)}`
    case 'done':
      return closed('terminée')
    case 'dropped':
      return closed('abandonnée')
    case 'expired':
      return closed('expirée')
  }
}

/** Échéance : « expire dans 13 j » tant qu'elle est ouverte, « archivée le 26 nov. » ensuite. */
export function deadlineLabel(mission: MissionSummary, now: Date): string {
  if (mission.closedAt !== null) return `archivée le ${dayMonth.format(new Date(mission.closedAt))}`
  const left = Date.parse(mission.expiresAt) - now.getTime()
  if (left <= 0) return 'échéance dépassée'
  if (left < DAY) return `expire dans ${String(Math.max(1, Math.ceil(left / HOUR)))} h`
  return `expire dans ${String(Math.floor(left / DAY))} j`
}

export type LifecycleStepState = 'done' | 'current' | 'upcoming'

export interface LifecycleStep {
  readonly label: string
  readonly detail: string
  readonly state: LifecycleStepState
}

/** Dernier événement d'un type, ou undefined. */
function lastEvent(events: readonly MissionEvent[], type: MissionEvent['type']) {
  return events.filter((event) => event.type === type).at(-1)
}

function actorLabel(event: MissionEvent | undefined): string | null {
  if (event === undefined) return null
  const { actor } = event
  if ('sessionLabel' in actor) return actor.sessionLabel
  if ('userId' in actor) return actor.userId
  return null
}

/**
 * Frise du cycle de vie en 4 étapes (À valider → Prête → En cours → Terminée) : étapes passées
 * cochées, étape courante en accent (SPEC §8.4, maquettes 34–38).
 */
export function lifecycleSteps(
  mission: Mission,
  events: readonly MissionEvent[],
  now: Date,
  validatorName: (userId: string) => string = (userId) => userId,
): readonly LifecycleStep[] {
  const index = { draft: 0, ready: 1, in_progress: 2, done: 3, dropped: 3, expired: 3 }[
    mission.status
  ]
  const state = (step: number): LifecycleStepState =>
    step < index || mission.status === 'done' ? 'done' : step === index ? 'current' : 'upcoming'
  const author = mission.origin.session?.sessionLabel ?? mission.origin.createdBy
  const taken = lastEvent(events, 'taken')
  const takenDetail =
    mission.status === 'in_progress'
      ? `${mission.claim.session.sessionLabel} · ${elapsedLabel(mission.claim.acquiredAt, now)}`
      : taken === undefined
        ? 'prise par 1 session'
        : `${actorLabel(taken) ?? 'session'} · ${elapsedLabel(taken.at, now)}`
  return [
    { label: 'À valider', detail: `écrite par ${author}`, state: state(0) },
    {
      label: 'Prête',
      detail:
        mission.validation === null
          ? mission.status === 'draft'
            ? 'après validation'
            : 'sans validation requise'
          : `validée par ${validatorName(mission.validation.by)}`,
      state: state(1),
    },
    {
      label: 'En cours',
      detail:
        mission.status === 'done' || mission.status === 'in_progress'
          ? takenDetail
          : 'prise par 1 session',
      state: mission.status === 'dropped' || mission.status === 'expired' ? 'upcoming' : state(2),
    },
    {
      label: 'Terminée',
      detail: mission.status === 'done' ? 'résultat enregistré' : 'puis archivée',
      state: mission.status === 'done' ? 'done' : 'upcoming',
    },
  ]
}

export interface BatchSegment {
  readonly status: MissionStatus
  readonly count: number
  readonly label: string
}

/** Barre d'avancement du bloc « Origine » : terminées, en cours, prêtes, à valider, abandonnées. */
const BATCH_ORDER = ['done', 'in_progress', 'ready', 'draft', 'dropped', 'expired'] as const

const BATCH_LABELS: Readonly<Record<MissionStatus, readonly [string, string]>> = {
  done: ['terminée', 'terminées'],
  in_progress: ['en cours', 'en cours'],
  ready: ['prête', 'prêtes'],
  draft: ['à valider', 'à valider'],
  dropped: ['abandonnée', 'abandonnées'],
  expired: ['expirée', 'expirées'],
}

export function batchSegments(counts: MissionStatusCounts): readonly BatchSegment[] {
  return BATCH_ORDER.filter((status) => counts[status] > 0).map((status) => {
    const [one, many] = BATCH_LABELS[status]
    return { status, count: counts[status], label: plural(counts[status], one, many) }
  })
}
