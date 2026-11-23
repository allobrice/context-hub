import { describe, expect, it } from 'vitest'

import { mention, pinnedUri, resourceUri } from './uri.ts'

const ctx = { slug: 'nuxt/conventions-nuxt-4' }

describe('URI MCP', () => {
  it('construit l’URI de ressource', () => {
    expect(resourceUri(ctx)).toBe('context://nuxt/conventions-nuxt-4')
  })

  it('construit l’URI figée sur une version', () => {
    expect(pinnedUri(ctx, 4)).toBe('context://nuxt/conventions-nuxt-4@4')
  })

  it.each([0, -1, 1.5, Number.NaN])('refuse un numéro de version invalide (%s)', (n) => {
    expect(() => pinnedUri(ctx, n)).toThrow(RangeError)
  })

  it('construit la mention pour un prompt', () => {
    expect(mention(ctx)).toBe('@context-hub:context://nuxt/conventions-nuxt-4')
  })
})
