import { describe, expect, it } from 'vitest'

import { aContext, aVersion } from '../test-utils/fixtures.ts'
import { toContextId } from '../context/types.ts'
import { UNCATEGORIZED_COLLECTION_ID as NONE } from '../taxonomy/types.ts'
import {
  activeFilterCount,
  countBy,
  countByStatus,
  DEFAULT_LIBRARY_CRITERIA,
  filterContexts,
  matchesQuery,
  pageWindow,
  paginate,
  queryTerms,
  sortContexts,
  titleSortKey,
} from './criteria.ts'

const nuxt = aContext({
  id: toContextId('a'),
  title: 'Conventions Nuxt 4',
  tags: ['nuxt', 'conventions'],
  updatedAt: '2026-11-23T09:12:00Z',
  publishedVersion: aVersion({ content: 'Utiliser useAsyncData avec une clé explicite' }),
})
const review = aContext({
  id: toContextId('b'),
  title: 'Règles de revue de code',
  collectionId: 'review',
  tags: ['review', 'qualité'],
  updatedAt: '2026-11-22T10:00:00Z',
})
const debug = aContext({
  id: toContextId('c'),
  title: 'Prompts de debug Nitro',
  collectionId: null,
  status: 'draft',
  scope: { kind: 'personal', owner: 'brice' },
  tags: ['nitro', 'debug'],
  updatedAt: '2026-11-08T10:00:00Z',
})
const ALL = [debug, nuxt, review]

describe('matchesQuery', () => {
  it('cherche dans le titre, la description, les tags et le contenu, sans casse ni accents', () => {
    expect(matchesQuery(nuxt, 'NUXT')).toBe(true)
    expect(matchesQuery(review, 'qualite')).toBe(true)
    expect(matchesQuery(review, 'regles')).toBe(true)
    expect(matchesQuery(nuxt, 'useasyncdata cle')).toBe(true)
    expect(matchesQuery(nuxt, 'pinia')).toBe(false)
  })

  it('accepte une requête vide', () => {
    expect(matchesQuery(nuxt, '   ')).toBe(true)
  })
})

describe('filterContexts', () => {
  const filters = DEFAULT_LIBRARY_CRITERIA

  it('ne filtre rien par défaut', () => {
    expect(filterContexts(ALL, filters)).toEqual(ALL)
  })

  it('filtre par statut, portée, tags (ET) et collection', () => {
    expect(filterContexts(ALL, { ...filters, status: 'draft' })).toEqual([debug])
    expect(filterContexts(ALL, { ...filters, scope: 'team' })).toEqual([nuxt, review])
    expect(filterContexts(ALL, { ...filters, tags: ['nuxt', 'conventions'] })).toEqual([nuxt])
    expect(filterContexts(ALL, { ...filters, tags: ['nuxt', 'review'] })).toEqual([])
    expect(filterContexts(ALL, { ...filters, collectionId: 'review' })).toEqual([review])
  })

  it('associe collectionId null à « Sans collection »', () => {
    expect(filterContexts(ALL, { ...filters, collectionId: NONE })).toEqual([debug])
  })
})

describe('activeFilterCount', () => {
  it('compte chaque tag et chaque filtre, sans la recherche', () => {
    expect(activeFilterCount(DEFAULT_LIBRARY_CRITERIA)).toBe(0)
    expect(
      activeFilterCount({
        ...DEFAULT_LIBRARY_CRITERIA,
        query: 'x',
        tags: ['a', 'b'],
        status: 'draft',
        scope: 'team',
        collectionId: 'nuxt',
      }),
    ).toBe(5)
  })
})

describe('sortContexts', () => {
  it('trie par mise à jour et par titre (collation française)', () => {
    expect(sortContexts(ALL, 'updated-desc')).toEqual([nuxt, review, debug])
    expect(sortContexts(ALL, 'updated-asc')).toEqual([debug, review, nuxt])
    expect(sortContexts(ALL, 'title-asc').map((c) => c.title)).toEqual([
      'Conventions Nuxt 4',
      'Prompts de debug Nitro',
      'Règles de revue de code',
    ])
    expect(sortContexts(ALL, 'title-desc')[0]).toBe(review)
  })

  it('compare des instants, pas des chaînes (fuseaux différents)', () => {
    // 10:30Z est postérieur à 11:00+02:00 (= 09:00Z), alors que la chaîne « 10:30 » est plus petite.
    const utc = aContext({ id: toContextId('utc'), updatedAt: '2026-09-01T10:30:00Z' })
    const paris = aContext({ id: toContextId('paris'), updatedAt: '2026-09-01T11:00:00+02:00' })
    expect(sortContexts([paris, utc], 'updated-desc')).toEqual([utc, paris])
  })

  it('ne modifie pas le tableau d’origine', () => {
    const input = [...ALL]
    sortContexts(input, 'title-asc')
    expect(input).toEqual(ALL)
  })
})

describe('paginate', () => {
  const items = Array.from({ length: 42 }, (_, i) => i + 1)

  it('découpe par 25', () => {
    expect(paginate(items, 1)).toMatchObject({ total: 42, page: 1, pageCount: 2, from: 1, to: 25 })
    expect(paginate(items, 2)).toMatchObject({ page: 2, from: 26, to: 42, items: items.slice(25) })
  })

  it('ramène une page hors bornes dans l’intervalle', () => {
    expect(paginate(items, 9).page).toBe(2)
    expect(paginate(items, 0).page).toBe(1)
    expect(paginate(items, Number.NaN).page).toBe(1)
  })

  it('gère une liste vide', () => {
    expect(paginate([], 1)).toEqual({ items: [], total: 0, page: 1, pageCount: 1, from: 0, to: 0 })
  })
})

describe('compteurs', () => {
  it('compte par statut', () => {
    expect(countByStatus(ALL)).toEqual({ published: 2, draft: 1, archived: 0, total: 3 })
  })

  it('compte par clé arbitraire', () => {
    const byScope = countBy(ALL, (c) => c.scope.kind)
    expect(byScope.get('team')).toBe(2)
    expect(byScope.get('personal')).toBe(1)
    expect(byScope.get('project')).toBeUndefined()
  })
})

describe('queryTerms', () => {
  it('découpe sur les espaces, sans casse ni accents', () => {
    expect(queryTerms('  Écrire   des Tests ')).toEqual(['ecrire', 'des', 'tests'])
  })

  it('renvoie une liste vide pour une recherche blanche', () => {
    expect(queryTerms('   ')).toEqual([])
  })
})

describe('titleSortKey', () => {
  it('range les titres sans casse ni accents', () => {
    expect(titleSortKey(' Écrire des tests ')).toBe('ecrire des tests')
    expect(titleSortKey('Écrire') < titleSortKey('Fixer')).toBe(true)
  })
})

describe('pageWindow', () => {
  it('calcule l’offset de la page demandée', () => {
    expect(pageWindow(42, 2)).toEqual({ page: 2, pageCount: 2, offset: 25, pageSize: 25 })
  })

  it('ramène une page hors bornes à la dernière page valide, et un total nul à la page 1', () => {
    expect(pageWindow(42, 9).page).toBe(2)
    expect(pageWindow(0, 3)).toEqual({ page: 1, pageCount: 1, offset: 0, pageSize: 25 })
  })
})
