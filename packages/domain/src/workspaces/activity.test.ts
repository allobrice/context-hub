import { describe, expect, it } from 'vitest'

import { deriveWorkspaceStatus, isSessionActive, shouldAutoClose } from './activity.ts'

const NOW = new Date('2026-11-23T10:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const daysAgo = (days: number) => minutesAgo(days * 24 * 60)

describe('isSessionActive', () => {
  it('active sous 5 minutes, inactive à 5 minutes', () => {
    expect(isSessionActive(minutesAgo(0), NOW)).toBe(true)
    expect(isSessionActive(minutesAgo(4.99), NOW)).toBe(true)
    expect(isSessionActive(minutesAgo(5), NOW)).toBe(false)
  })
})

describe('deriveWorkspaceStatus', () => {
  it.each([
    ['open', daysAgo(0), 'open'],
    ['open', daysAgo(6.9), 'open'],
    ['open', daysAgo(7), 'inactive'],
    ['open', daysAgo(40), 'inactive'],
    ['closed', daysAgo(0), 'closed'],
  ] as const)('%s, activité %s → %s', (status, lastActivityAt, expected) => {
    expect(deriveWorkspaceStatus({ status, lastActivityAt }, NOW)).toBe(expected)
  })
})

describe('shouldAutoClose', () => {
  it('ferme un workspace ouvert sans activité depuis 30 jours', () => {
    expect(shouldAutoClose({ status: 'open', lastActivityAt: daysAgo(29.9) }, NOW)).toBe(false)
    expect(shouldAutoClose({ status: 'open', lastActivityAt: daysAgo(30) }, NOW)).toBe(true)
    expect(shouldAutoClose({ status: 'closed', lastActivityAt: daysAgo(90) }, NOW)).toBe(false)
  })
})
