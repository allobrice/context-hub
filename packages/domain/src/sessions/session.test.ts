import { describe, expect, it } from 'vitest'

import { isSameSession, isSessionActive } from './session.ts'

const NOW = new Date('2026-11-23T10:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

describe('isSessionActive', () => {
  it('active sous 5 minutes, inactive à 5 minutes', () => {
    expect(isSessionActive(minutesAgo(0), NOW)).toBe(true)
    expect(isSessionActive(minutesAgo(4.99), NOW)).toBe(true)
    expect(isSessionActive(minutesAgo(5), NOW)).toBe(false)
  })
})

describe('isSameSession', () => {
  it('distingue deux sessions d’un même utilisateur dans le même repo', () => {
    expect(
      isSameSession(
        { userId: 'brice', sessionLabel: 'web-1' },
        { userId: 'brice', sessionLabel: 'web-2' },
      ),
    ).toBe(false)
    expect(
      isSameSession(
        { userId: 'brice', sessionLabel: 'web-1' },
        { userId: 'camille', sessionLabel: 'web-1' },
      ),
    ).toBe(false)
    expect(
      isSameSession(
        { userId: 'brice', sessionLabel: 'web-1' },
        { userId: 'brice', sessionLabel: 'web-1' },
      ),
    ).toBe(true)
  })
})
