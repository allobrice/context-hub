import { describe, expect, it } from 'vitest'

import { MISSION_EVENT_DETAILS, freshnessChangedCount, isClaimExpiry } from './eventDetails.ts'

describe('détails des événements : écriture et relecture', () => {
  it('freshnessChangedCount relit ce que MISSION_EVENT_DETAILS.freshness écrit', () => {
    for (const count of [0, 1, 2, 50]) {
      const detail = MISSION_EVENT_DETAILS.freshness(count)
      expect(freshnessChangedCount({ type: 'freshness', detail })).toBe(count)
    }
  })

  it('freshnessChangedCount : null hors fraîcheur, sans détail ou détail illisible', () => {
    const detail = MISSION_EVENT_DETAILS.freshness(2)
    expect(freshnessChangedCount({ type: 'taken', detail })).toBeNull()
    expect(freshnessChangedCount({ type: 'freshness', detail: null })).toBeNull()
    expect(freshnessChangedCount({ type: 'freshness', detail: '2 fichiers' })).toBeNull()
  })

  it('isClaimExpiry : libération par échéance seulement', () => {
    const detail = MISSION_EVENT_DETAILS.claimExpired
    expect(isClaimExpiry({ type: 'released', detail })).toBe(true)
    expect(isClaimExpiry({ type: 'released', detail: 'forcée' })).toBe(false)
    expect(isClaimExpiry({ type: 'released', detail: null })).toBe(false)
    expect(isClaimExpiry({ type: 'dropped', detail })).toBe(false)
  })
})
