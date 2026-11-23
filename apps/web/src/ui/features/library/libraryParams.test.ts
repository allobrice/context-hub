import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LIBRARY_STATE,
  libraryHref,
  parseLibraryParams,
  patchLibraryState,
  writeLibraryParams,
} from './libraryParams.ts'

describe('paramètres d’URL de la Bibliothèque', () => {
  it('lit l’état complet', () => {
    const params = new URLSearchParams(
      'q=pinia+ssr&tags=vue,nuxt&collection=nuxt&scope=team&status=draft&sort=title-asc&page=2&view=cards',
    )
    expect(parseLibraryParams(params)).toEqual({
      query: 'pinia ssr',
      tags: ['vue', 'nuxt'],
      collectionId: 'nuxt',
      scope: 'team',
      status: 'draft',
      sort: 'title-asc',
      page: 2,
      view: 'cards',
    })
  })

  it('ignore les valeurs invalides', () => {
    expect(
      parseLibraryParams(new URLSearchParams('scope=galaxie&status=x&sort=y&page=-3&view=z')),
    ).toEqual(DEFAULT_LIBRARY_STATE)
  })

  it('omet les valeurs par défaut et conserve les paramètres étrangers', () => {
    const base = new URLSearchParams('mock=error&q=ancien')
    const written = writeLibraryParams({ ...DEFAULT_LIBRARY_STATE, scope: 'team' }, base)
    expect(written.toString()).toBe('mock=error&scope=team')
  })

  it('aller-retour sans perte', () => {
    const state = {
      ...DEFAULT_LIBRARY_STATE,
      query: 'vue',
      tags: ['a11y'],
      sort: 'updated-asc' as const,
      page: 3,
    }
    expect(parseLibraryParams(writeLibraryParams(state))).toEqual(state)
  })

  it('revient en page 1 quand un filtre change, pas quand la vue change', () => {
    const onPage2 = { ...DEFAULT_LIBRARY_STATE, page: 2 }
    expect(patchLibraryState(onPage2, { status: 'draft' }).page).toBe(1)
    expect(patchLibraryState(onPage2, { view: 'cards' }).page).toBe(2)
    expect(patchLibraryState(onPage2, { page: 3 }).page).toBe(3)
  })

  it('construit des liens de filtre', () => {
    expect(libraryHref({ collectionId: 'nuxt' })).toBe('/?collection=nuxt')
    expect(libraryHref({})).toBe('/')
  })
})
