import { describe, expect, it } from 'vitest'

import { isLeaseExpired, leaseUntil } from './lease.ts'

const NOW = new Date('2026-11-23T10:00:00.000Z')

describe('leaseUntil', () => {
  it('ajoute la durée en minutes, en ISO UTC', () => {
    expect(leaseUntil(NOW, 30)).toBe('2026-11-23T10:30:00.000Z')
  })
})

describe('isLeaseExpired', () => {
  it('échu à l’échéance exacte, pas avant', () => {
    expect(isLeaseExpired({ expiresAt: '2026-11-23T10:00:00.000Z' }, NOW)).toBe(true)
    expect(isLeaseExpired({ expiresAt: '2026-11-23T10:00:01.000Z' }, NOW)).toBe(false)
  })
})
