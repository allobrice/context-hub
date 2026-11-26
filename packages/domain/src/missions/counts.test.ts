import { describe, expect, it } from 'vitest'

import { countStatuses, emptyStatusCounts, toFilterCounts } from './counts.ts'
import { MISSION_FILTER_STATUSES, MISSION_QUEUE_FILTERS, MISSION_STATUSES } from './types.ts'

describe('comptage des missions', () => {
  it('emptyStatusCounts : un zéro par statut, et un nouvel objet à chaque appel', () => {
    const counts = emptyStatusCounts()
    expect(Object.keys(counts).sort()).toEqual([...MISSION_STATUSES].sort())
    expect(Object.values(counts).every((count) => count === 0)).toBe(true)
    counts.draft = 3
    expect(emptyStatusCounts().draft).toBe(0)
  })

  it('countStatuses compte chaque statut, absent = 0', () => {
    const statuses = ['ready', 'ready', 'done', 'draft'] as const
    expect(countStatuses(statuses.map((status) => ({ status })))).toEqual({
      ...emptyStatusCounts(),
      ready: 2,
      done: 1,
      draft: 1,
    })
    expect(countStatuses([])).toEqual(emptyStatusCounts())
  })

  it('toFilterCounts additionne les statuts de chaque filtre', () => {
    const counts = { draft: 1, ready: 2, in_progress: 1, done: 1, dropped: 1, expired: 0 }
    expect(toFilterCounts(counts)).toEqual({
      todo: 4,
      to_validate: 1,
      ready: 2,
      archived: 2,
      all: 6,
    })
  })

  it('toFilterCounts couvre chaque filtre, chaque statut pesant 1 dans les filtres qui le listent', () => {
    for (const status of MISSION_STATUSES) {
      const filters = toFilterCounts(countStatuses([{ status }]))
      for (const filter of MISSION_QUEUE_FILTERS) {
        expect(filters[filter]).toBe(MISSION_FILTER_STATUSES[filter].includes(status) ? 1 : 0)
      }
    }
  })
})
