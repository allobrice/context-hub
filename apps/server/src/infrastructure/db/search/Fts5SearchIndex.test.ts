import { describe, expect, it } from 'vitest'

import { toMatchExpression } from './Fts5SearchIndex.ts'

describe('toMatchExpression', () => {
  it('cherche chaque terme en préfixe, sans accents, tous requis', () => {
    expect(toMatchExpression('Écrire  Tests', 'library')).toBe('"ecrire"* AND "tests"*')
  })

  it('limite la recherche publiée aux colonnes hors brouillon', () => {
    expect(toMatchExpression('nuxt', 'published')).toBe(
      '{title description slug tags published_content} : ("nuxt"*)',
    )
  })

  it('neutralise la syntaxe FTS5 (opérateurs, guillemets, colonnes)', () => {
    expect(toMatchExpression('draft_content:secret OR "x', 'published')).toBe(
      '{title description slug tags published_content} : ("draft_content:secret"* AND "or"* AND """x"*)',
    )
  })

  it('ignore une recherche sans mot', () => {
    expect(toMatchExpression('  -- * ', 'library')).toBeNull()
  })
})
