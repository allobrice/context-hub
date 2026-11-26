import {
  MISSION_QUEUE_FILTERS,
  type MissionQueueFilter,
} from '@context-hub/domain/missions/types.ts'

import type { MissionListQuery } from '../../../../application/ports/MissionRepository.ts'

/**
 * Filtres de la file des missions sérialisés dans l'URL (SPEC §8.4) :
 * `?filter=&tags=&repo=&batch=`. Les valeurs par défaut sont omises, les paramètres inconnus
 * (ex. `mock`) conservés.
 */
export const DEFAULT_MISSION_QUERY: MissionListQuery = {
  filter: 'todo',
  tags: [],
  repo: null,
  batchId: null,
}

const KEYS = {
  filter: 'filter',
  tags: 'tags',
  repo: 'repo',
  batchId: 'batch',
} as const satisfies Record<keyof MissionListQuery, string>

/**
 * Alias `?status=` décrit par SPEC §1 (`active|draft|ready|archived|all`) : le code, l'API et le
 * plugin utilisent `?filter=`. Lu seulement, jamais écrit ; `filter` reste prioritaire.
 */
const STATUS_PARAM = 'status'
const STATUS_ALIASES: ReadonlyMap<string, MissionQueueFilter> = new Map([
  ['active', 'todo'],
  ['draft', 'to_validate'],
  ['ready', 'ready'],
  ['archived', 'archived'],
  ['all', 'all'],
])

function parseFilter(filter: string | null, status: string | null): MissionQueueFilter {
  return (
    MISSION_QUEUE_FILTERS.find((candidate) => candidate === filter) ??
    (status === null ? undefined : STATUS_ALIASES.get(status)) ??
    DEFAULT_MISSION_QUERY.filter
  )
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}

function parseTags(value: string | null): string[] {
  const tags = (value ?? '').split(',').map((tag) => tag.trim())
  return [...new Set(tags.filter((tag) => tag !== ''))]
}

export function parseMissionParams(params: URLSearchParams): MissionListQuery {
  return {
    filter: parseFilter(params.get(KEYS.filter), params.get(STATUS_PARAM)),
    tags: parseTags(params.get(KEYS.tags)),
    repo: nonEmpty(params.get(KEYS.repo)),
    batchId: nonEmpty(params.get(KEYS.batchId)),
  }
}

/** Écrit la requête dans une copie de `base` : valeurs par défaut omises, paramètres étrangers conservés. */
export function writeMissionParams(
  query: MissionListQuery,
  base: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(base)
  // L'alias de la SPEC ne survit pas à une modification : `filter` seul décrit le filtre choisi.
  params.delete(STATUS_PARAM)
  const entries: readonly (readonly [string, string | null])[] = [
    [KEYS.filter, query.filter === DEFAULT_MISSION_QUERY.filter ? null : query.filter],
    [KEYS.tags, query.tags.length > 0 ? query.tags.join(',') : null],
    [KEYS.repo, query.repo],
    [KEYS.batchId, query.batchId],
  ]
  for (const [name, value] of entries) {
    if (value === null) params.delete(name)
    else params.set(name, value)
  }
  return params
}

/** Bascule un tag dans le filtre (ajout ou retrait). */
export function toggleTag(tags: readonly string[], tag: string): string[] {
  return tags.includes(tag) ? tags.filter((current) => current !== tag) : [...tags, tag]
}

/**
 * Commande du rappel de l'en-tête : prend la prochaine mission portant les tags filtrés, ou la
 * prochaine mission tout court sans filtre de tags (`argument-hint: [tag…]` du plugin).
 */
export function nextCommand(tags: readonly string[]): string {
  return ['/context-hub:next', ...tags].join(' ')
}

/**
 * Valeurs proposées par un menu de filtre (tags, repo) : les facettes de la file (toutes les missions
 * visibles du lot), plus celles déjà sélectionnées pour pouvoir les retirer. Triées, sans doublon.
 */
export function facetValues(shown: Iterable<string>, selected: Iterable<string>): string[] {
  return [...new Set([...shown, ...selected])].sort((a, b) => a.localeCompare(b, 'fr'))
}
