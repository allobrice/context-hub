import { describe, expect, it } from 'vitest'

import {
  formatDate,
  formatDateTime,
  formatInteger,
  formatRelativeDate,
  formatShortDateTime,
  formatTokensCompact,
  plural,
} from './format.ts'

// Horloge des fixtures : 23 nov. 2026, 11:12 (Europe/Paris, TZ fixé par vite.config.ts).
const NOW = new Date('2026-11-23T11:12:00+01:00')

describe('formatRelativeDate (maquette 01)', () => {
  it.each([
    ['2026-11-23T11:11:40+01:00', 'à l’instant'],
    ['2026-11-23T10:52:00+01:00', 'il y a 20 min'],
    ['2026-11-23T09:12:00+01:00', 'il y a 2 h'],
    ['2026-11-22T15:30:00+01:00', 'hier'],
    ['2026-11-22T00:05:00+01:00', 'hier'],
    ['2026-11-19T14:00:00+01:00', '19 nov.'],
    ['2026-10-02T17:20:00+02:00', '2 oct.'],
    ['2025-10-02T17:20:00+02:00', '2 oct. 2025'],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelativeDate(iso, NOW)).toBe(expected)
  })
})

describe('dates absolues (maquette 08)', () => {
  it('formate date, date-heure et date courte', () => {
    expect(formatDate('2026-09-03T10:21:00+02:00')).toBe('3 sept. 2026')
    expect(formatDateTime('2026-11-23T09:12:00+01:00')).toBe('23 nov. 2026, 09:12')
    expect(formatShortDateTime('2026-11-14T16:40:00+01:00')).toBe('14 nov. 16:40')
  })
})

describe('nombres', () => {
  it.each([
    [2140, '2,1k'],
    [600, '0,6k'],
    [3400, '3,4k'],
  ])('tokens %i → %s', (tokens, expected) => {
    expect(formatTokensCompact(tokens)).toBe(expected)
  })

  it('sépare les milliers à la française', () => {
    expect(formatInteger(2140).replace(/\s/gu, ' ')).toBe('2 140')
  })
})

describe('plural', () => {
  it('accorde au singulier pour 0 et 1', () => {
    expect(plural(0, 'résultat', 'résultats')).toBe('0 résultat')
    expect(plural(1, 'résultat', 'résultats')).toBe('1 résultat')
    expect(plural(42, 'résultat', 'résultats')).toBe('42 résultats')
  })
})
