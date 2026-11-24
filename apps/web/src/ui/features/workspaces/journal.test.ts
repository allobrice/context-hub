import { describe, expect, it } from 'vitest'

import type { WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'

import { EMPTY_JOURNAL, mergeEntries, nextSeqOf, olderRangeLabel, oldestSeqOf } from './journal.ts'

function entry(seq: number, body = `n° ${seq}`): WorkspaceEntry {
  return {
    workspaceId: 'ws',
    seq,
    kind: 'note',
    body,
    files: [],
    author: { system: 'lifecycle' },
    redactions: 0,
    suspicious: false,
    createdAt: '2026-11-23T10:00:00.000Z',
  }
}

describe('journal : fusion incrémentale', () => {
  it('trie de la plus récente à la plus ancienne, sans doublon', () => {
    const first = mergeEntries(EMPTY_JOURNAL, [entry(46), entry(47), entry(48)])
    const merged = mergeEntries(first, [entry(48, 'reçue deux fois'), entry(49), entry(50)])
    expect(merged.entries.map((e) => e.seq)).toEqual([50, 49, 48, 47, 46])
    expect(merged.entries[2]?.body).toBe('reçue deux fois')
  })

  it('garde l’état tel quel sans nouvelle entrée (pas de rendu inutile)', () => {
    const state = mergeEntries(EMPTY_JOURNAL, [entry(1)])
    expect(mergeEntries(state, [])).toBe(state)
  })

  it('curseurs : prochain seq à demander, plus ancien chargé, plage précédente', () => {
    const state = { ...mergeEntries(EMPTY_JOURNAL, [entry(42), entry(48)]), hasOlder: true }
    expect(nextSeqOf(state)).toBe(49)
    expect(oldestSeqOf(state)).toBe(42)
    expect(olderRangeLabel(state)).toBe('#1–#41')
    expect(olderRangeLabel({ ...state, hasOlder: false })).toBeNull()
    expect(nextSeqOf(EMPTY_JOURNAL)).toBe(1)
  })
})
