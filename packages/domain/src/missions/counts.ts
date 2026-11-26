/**
 * Comptage des statuts de mission et des filtres de la file (SPEC §8.4) : seule implémentation,
 * partagée par le serveur (service, store) et les adapters du front. Un nouveau statut ou filtre ne
 * s'ajoute qu'ici, et le typage `Record` signale tout oubli.
 */
import {
  MISSION_FILTER_STATUSES,
  type Mission,
  type MissionFilterCounts,
  type MissionQueueFilter,
  type MissionStatus,
  type MissionStatusCounts,
} from './types.ts'

/** Compteurs à zéro pour chaque statut, modifiables (à remplir, ex. depuis un `GROUP BY`). */
export function emptyStatusCounts(): Record<MissionStatus, number> {
  return { draft: 0, ready: 0, in_progress: 0, done: 0, dropped: 0, expired: 0 }
}

/** Nombre de missions par statut. */
export function countStatuses(missions: Iterable<Pick<Mission, 'status'>>): MissionStatusCounts {
  const counts = emptyStatusCounts()
  for (const { status } of missions) counts[status] += 1
  return counts
}

/** Compteurs des filtres segmentés, déduits des compteurs par statut (`MISSION_FILTER_STATUSES`). */
export function toFilterCounts(counts: MissionStatusCounts): MissionFilterCounts {
  const total = (filter: MissionQueueFilter) =>
    MISSION_FILTER_STATUSES[filter].reduce((sum, status) => sum + counts[status], 0)
  return {
    todo: total('todo'),
    to_validate: total('to_validate'),
    ready: total('ready'),
    archived: total('archived'),
    all: total('all'),
  }
}
