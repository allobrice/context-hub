/**
 * Libellés du détail d'une mission (SPEC §8.4, maquettes 34–39) : historique, code d'origine,
 * fraîcheur, auteurs. Fonctions pures ; les textes d'une session (raisons, détails) restent du texte.
 */
import type {
  Deliverable,
  Mission,
  MissionEvent,
  MissionEventActor,
} from '@context-hub/domain/missions/types.ts'
import { isSameSession, type SessionRef } from '@context-hub/domain/sessions/session.ts'

import { plural } from '../../../lib/format.ts'

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/** « 25 nov. » */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso))
}

/** « 25 nov. à 14:20 » */
export function formatDayAt(iso: string): string {
  const date = new Date(iso)
  return `${dayMonth.format(date)} à ${time.format(date)}`
}

function isSessionActor(actor: MissionEventActor): actor is SessionRef {
  return 'sessionLabel' in actor
}

/** Sessions connues de la mission : leur `userName` donne le nom affiché d'un utilisateur. */
function knownSessions(mission: Mission, events: readonly MissionEvent[]): SessionRef[] {
  const sessions = [mission.origin.session, mission.claim?.session, mission.freshness?.checkedBy]
  return [
    ...sessions.filter((session) => session !== null && session !== undefined),
    ...events.map((event) => event.actor).filter(isSessionActor),
  ]
}

/**
 * Nom affiché d'un utilisateur (« Brice ») : le détail ne transporte que son identifiant pour la
 * validation et les actions humaines ; on le retrouve dans une session connue, sinon on le capitalise.
 */
export function userNameOf(
  userId: string,
  mission: Mission,
  events: readonly MissionEvent[],
): string {
  const known = knownSessions(mission, events).find((session) => session.userId === userId)
  return known?.userName ?? userId.charAt(0).toUpperCase() + userId.slice(1)
}

/** Auteur d'un événement : le label de la session, le nom de l'utilisateur, ou le système. */
export function actorName(
  actor: MissionEventActor,
  mission: Mission,
  events: readonly MissionEvent[],
): string {
  if (isSessionActor(actor)) return actor.sessionLabel
  if ('userId' in actor) return userNameOf(actor.userId, mission, events)
  return 'le système'
}

/** « Créée par perf-1 depuis l’audit perf » : premier segment du libellé d'origine, en minuscule. */
export function originPhrase(label: string): string {
  const head = label.split(' · ')[0]?.trim() ?? ''
  if (head === '') return ''
  const lower = head.charAt(0).toLowerCase() + head.slice(1)
  return /^[aeiouyhàâéèêîôû]/i.test(lower) ? `l’${lower}` : `« ${head} »`
}

export function deliverableLabel(deliverable: Deliverable): string {
  switch (deliverable.kind) {
    case 'pr':
      return `PR ${deliverable.ref}`
    case 'commit':
      return `commit ${deliverable.ref}`
    case 'url':
      return deliverable.ref
  }
}

/** Nombre de fichiers modifiés rapporté par un événement `freshness` (« 2 fichier(s) modifié(s) »). */
export function freshnessCount(detail: string | null): number | null {
  const match = /^(\d+)\b/.exec(detail ?? '')
  return match?.[1] === undefined ? null : Number(match[1])
}

function freshnessSuffix(detail: string | null): string {
  const count = freshnessCount(detail)
  if (count === null) return 'code contrôlé'
  return count === 0 ? 'code vérifié à jour' : plural(count, 'fichier modifié', 'fichiers modifiés')
}

export interface HistoryItem {
  readonly key: string
  readonly label: string
  readonly at: string
}

function eventLabel(
  event: MissionEvent,
  mission: Mission,
  events: readonly MissionEvent[],
  isLastCompletion: boolean,
): string {
  const who = actorName(event.actor, mission, events)
  switch (event.type) {
    case 'created': {
      const origin = originPhrase(mission.origin.label)
      return origin === '' ? `Créée par ${who}` : `Créée par ${who} depuis ${origin}`
    }
    case 'validated':
      return `Validée par ${who}`
    case 'rejected':
      return `Rejetée par ${who}`
    case 'taken':
      return `Prise par ${who}`
    case 'freshness':
      return `Code contrôlé par ${who} · ${freshnessSuffix(event.detail)}`
    case 'released':
      return event.detail === 'réservation expirée'
        ? 'Réservation expirée : mission de nouveau prête'
        : `Libérée par ${who}`
    case 'completed': {
      const deliverable = isLastCompletion ? mission.result?.deliverables[0] : undefined
      return deliverable === undefined
        ? `Terminée par ${who}`
        : `Terminée par ${who} · ${deliverableLabel(deliverable)}`
    }
    case 'dropped':
      return `Abandonnée par ${who}`
    case 'expired':
      return 'Expirée sans avoir été prise'
    case 'reopened':
      return `Rouverte par ${who}`
  }
}

/**
 * Historique, du plus récent au plus ancien (maquettes 34–38). Le contrôle de fraîcheur qui suit
 * une prise par la même session est fusionné avec elle : « Prise par web-2 · code vérifié à jour ».
 */
export function historyItems(mission: Mission, events: readonly MissionEvent[]): HistoryItem[] {
  const lastCompletion = events.findLastIndex((event) => event.type === 'completed')
  const items: HistoryItem[] = []
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (event === undefined) continue
    const next = events[index + 1]
    const mergeFreshness =
      event.type === 'taken' &&
      next?.type === 'freshness' &&
      isSessionActor(event.actor) &&
      isSessionActor(next.actor) &&
      isSameSession(event.actor, next.actor)
    const label = eventLabel(event, mission, events, index === lastCompletion)
    items.push({
      key: `${String(index)}-${event.type}`,
      label: mergeFreshness ? `${label} · ${freshnessSuffix(next.detail)}` : label,
      at: event.at,
    })
    if (mergeFreshness) index += 1
  }
  return items.reverse()
}

export interface CodeFileState {
  readonly path: string
  readonly changed: boolean
}

/** Fichiers cités, « modifié » ou « inchangé » selon le dernier contrôle connu. */
export function codeFileStates(mission: Pick<Mission, 'codeRef' | 'freshness'>): CodeFileState[] {
  const changed = new Set(mission.freshness?.changedFiles ?? [])
  return mission.codeRef.files.map((path) => ({ path, changed: changed.has(path) }))
}

/** Bandeau « Le code a changé depuis la création » : N des M fichiers cités, ou null. */
export function freshnessWarning(
  mission: Pick<Mission, 'codeRef' | 'freshness'>,
): { readonly changed: number; readonly total: number; readonly checkedAt: string } | null {
  if (mission.freshness === null) return null
  const changed = codeFileStates(mission).filter((file) => file.changed).length
  return changed === 0
    ? null
    : { changed, total: mission.codeRef.files.length, checkedAt: mission.freshness.checkedAt }
}
