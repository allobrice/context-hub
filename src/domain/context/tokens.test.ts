import { describe, expect, it } from 'vitest'

import { countLines, estimateTokens } from './tokens.ts'

describe('estimateTokens', () => {
  it('vaut ≈ caractères / 4, arrondi', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdef')).toBe(2)
    expect(estimateTokens('x'.repeat(8560))).toBe(2140)
  })
})

describe('countLines', () => {
  it('compte une ligne pour un contenu vide et suit les retours à la ligne', () => {
    expect(countLines('')).toBe(1)
    expect(countLines('a\nb\n')).toBe(3)
  })
})
