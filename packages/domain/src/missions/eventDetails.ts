/**
 * Détails que le cycle de vie écrit dans le journal, et leur relecture : le format ne vit qu'ici.
 * L'UI lit ces informations par `freshnessChangedCount` et `isClaimExpiry`, jamais en analysant le
 * texte elle-même (une reformulation casserait l'historique sans erreur de type ; audit A-P3-1).
 */
import type { MissionEvent } from './types.ts'

export const MISSION_EVENT_DETAILS = {
  /** Libération par le job : la réservation est arrivée à échéance. */
  claimExpired: 'réservation expirée',
  /** Contrôle de fraîcheur : fichiers cités par la mission et modifiés depuis son commit. */
  freshness: (changedCount: number) => `${String(changedCount)} fichier(s) modifié(s)`,
} as const

const FRESHNESS_DETAIL = /^(\d+) fichier\(s\) modifié\(s\)$/

type EventDetail = Pick<MissionEvent, 'type' | 'detail'>

/** Nombre de fichiers modifiés d'un événement `freshness` ; null pour un autre événement ou un détail illisible. */
export function freshnessChangedCount(event: EventDetail): number | null {
  if (event.type !== 'freshness' || event.detail === null) return null
  const count = FRESHNESS_DETAIL.exec(event.detail)?.[1]
  return count === undefined ? null : Number(count)
}

/** Libération par le job (réservation échue), et non par un humain ou par la session. */
export function isClaimExpiry(event: EventDetail): boolean {
  return event.type === 'released' && event.detail === MISSION_EVENT_DETAILS.claimExpired
}
