/**
 * Libellés du détail d'une mission (SPEC §8.4, maquettes 34–39) : historique, code d'origine,
 * fraîcheur, auteurs. Fonctions pures ; les textes d'une session (raisons, détails) restent du texte.
 */
import { freshnessChangedCount, isClaimExpiry } from '@context-hub/domain/missions/eventDetails.ts'
import type {
  Deliverable,
  Mission,
  MissionDetail,
  MissionEvent,
  MissionEventActor,
} from '@context-hub/domain/missions/types.ts'
import { isSameSession, type SessionRef } from '@context-hub/domain/sessions/session.ts'

import { plural } from '../../../lib/format.ts'
import { changedCodeFiles } from '../shared/missionPresentation.ts'

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

type UserNames = MissionDetail['userNames']

/**
 * Nom affiché d'un utilisateur, d'après les noms renvoyés avec le détail (`userNames`) ; un
 * identifiant inconnu s'affiche tel quel (jamais deviné).
 */
export function userNameOf(userId: string, userNames: UserNames): string {
  return userNames[userId] ?? userId
}

/** Auteur d'un événement : le label de la session, le nom de l'utilisateur, ou le système. */
export function actorName(actor: MissionEventActor, userNames: UserNames): string {
  if (isSessionActor(actor)) return actor.sessionLabel
  if ('userId' in actor) return userNameOf(actor.userId, userNames)
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

/** Suffixe d'un contrôle de fraîcheur, d'après le nombre relu par le domaine. */
function freshnessSuffix(event: MissionEvent): string {
  const count = freshnessChangedCount(event)
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
  userNames: UserNames,
  isLastCompletion: boolean,
): string {
  const who = actorName(event.actor, userNames)
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
      return `Code contrôlé par ${who} · ${freshnessSuffix(event)}`
    case 'released':
      return isClaimExpiry(event)
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
    case 'edited':
      return event.detail === null ? `Modifiée par ${who}` : `Modifiée par ${who} · ${event.detail}`
  }
}

/**
 * Historique, du plus récent au plus ancien (maquettes 34–38). Le contrôle de fraîcheur qui suit
 * une prise par la même session est fusionné avec elle : « Prise par web-2 · code vérifié à jour ».
 */
export function historyItems({
  mission,
  events,
  userNames,
}: Pick<MissionDetail, 'mission' | 'events' | 'userNames'>): HistoryItem[] {
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
    const label = eventLabel(event, mission, userNames, index === lastCompletion)
    items.push({
      key: `${String(index)}-${event.type}`,
      label: mergeFreshness ? `${label} · ${freshnessSuffix(next)}` : label,
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
  const changed = new Set(changedCodeFiles(mission))
  return mission.codeRef.files.map((path) => ({ path, changed: changed.has(path) }))
}

/** Bandeau « Le code a changé depuis la création » : N des M fichiers cités, ou null. */
export function freshnessWarning(
  mission: Pick<Mission, 'codeRef' | 'freshness'>,
): { readonly changed: number; readonly total: number; readonly checkedAt: string } | null {
  if (mission.freshness === null) return null
  const changed = changedCodeFiles(mission).length
  return changed === 0
    ? null
    : { changed, total: mission.codeRef.files.length, checkedAt: mission.freshness.checkedAt }
}
