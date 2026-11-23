import { describe, expect, it } from 'vitest'

import { isValidSlug } from '../../domain/context/slug.ts'
import { DESCRIPTION_MAX_LENGTH } from '../../domain/context/types.ts'
import { countBy, countByStatus } from '../../domain/library/criteria.ts'
import { mergeImpact } from '../../domain/taxonomy/tags.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '../../domain/taxonomy/types.ts'
import { COLLECTION_FIXTURES } from './collections.ts'
import { CONTEXT_FIXTURES } from './contexts.ts'
import { TAG_FIXTURES } from './tags.ts'

/** Les compteurs visibles dans les maquettes SONT les fixtures attendues (SPEC §6). */
const contexts = CONTEXT_FIXTURES.map((record) => record.context)
const published = contexts.filter((context) => context.status === 'published')

describe('fixtures — cohérence avec les maquettes', () => {
  it('en-tête de la bibliothèque : 42 contextes · 31 publiés · 8 brouillons · 3 archivés', () => {
    expect(countByStatus(contexts)).toEqual({ total: 42, published: 31, draft: 8, archived: 3 })
  })

  it('collections : contextes et publiés (maquettes 01 et 21)', () => {
    const count = (list: typeof contexts) =>
      countBy(list, (c) => c.collectionId ?? UNCATEGORIZED_COLLECTION_ID)
    expect(Object.fromEntries(count(contexts))).toEqual({
      nuxt: 9,
      vue: 8,
      'conventions-allovoisins': 7,
      review: 6,
      'ci-cd': 4,
      [UNCATEGORIZED_COLLECTION_ID]: 8,
    })
    expect(Object.fromEntries(count(published))).toEqual({
      nuxt: 7,
      vue: 6,
      'conventions-allovoisins': 6,
      review: 6,
      'ci-cd': 3,
      [UNCATEGORIZED_COLLECTION_ID]: 3,
    })
  })

  it('portées : 5 personnels, 12 projets, 25 équipe', () => {
    expect(Object.fromEntries(countBy(contexts, (c) => c.scope.kind))).toEqual({
      personal: 5,
      project: 12,
      team: 25,
    })
  })

  it('tags : 34 au registre, compteurs de la maquette 16', () => {
    expect(TAG_FIXTURES).toHaveLength(34)
    const usage = (name: string) => [
      contexts.filter((c) => c.tags.includes(name)).length,
      published.filter((c) => c.tags.includes(name)).length,
    ]
    expect({
      conventions: usage('conventions'),
      nuxt: usage('nuxt'),
      vue: usage('vue'),
      'data-fetching': usage('data-fetching'),
      review: usage('review'),
      vue3: usage('vue3'),
      pinia: usage('pinia'),
      ci: usage('ci'),
      a11y: usage('a11y'),
      vuejs: usage('vuejs'),
      debug: usage('debug'),
      'legacy-webpack': usage('legacy-webpack'),
      database: usage('database'),
      'data-viz': usage('data-viz'),
    }).toEqual({
      conventions: [11, 9],
      nuxt: [9, 8],
      vue: [8, 7],
      'data-fetching': [6, 5],
      review: [6, 6],
      vue3: [5, 3],
      pinia: [4, 4],
      ci: [4, 3],
      a11y: [3, 3],
      vuejs: [2, 2],
      debug: [1, 0],
      'legacy-webpack': [0, 0],
      // Suggestions de la combobox (maquette 12).
      database: [2, 2],
      'data-viz': [1, 1],
    })
  })

  it('fusion vue3 + vuejs → vue : 7 contextes dont 5 publiés, 2 doublons évités (maquette 17)', () => {
    const sources = ['vue3', 'vuejs']
    const concerned = contexts.filter((c) => c.tags.some((tag) => sources.includes(tag)))
    expect(concerned).toHaveLength(7)
    expect(concerned.filter((c) => c.status === 'published')).toHaveLength(5)
    expect(mergeImpact(contexts, sources, 'vue')).toEqual({
      affectedContexts: 7,
      duplicatesAvoided: 2,
    })
  })

  it('n’utilise que des tags et collections déclarés', () => {
    const tagNames = new Set(TAG_FIXTURES.map((tag) => tag.name))
    const collectionIds = new Set(COLLECTION_FIXTURES.map((collection) => collection.id))
    for (const context of contexts) {
      expect(
        context.tags.every((tag) => tagNames.has(tag)),
        context.slug,
      ).toBe(true)
      expect(collectionIds.has(context.collectionId ?? UNCATEGORIZED_COLLECTION_ID)).toBe(true)
    }
  })

  it('respecte les invariants du domaine (slug, description, unicité)', () => {
    for (const context of contexts) {
      expect(isValidSlug(context.slug), context.slug).toBe(true)
      expect(context.description.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH)
    }
    expect(new Set(contexts.map((c) => c.slug)).size).toBe(42)
    expect(new Set(contexts.map((c) => c.id)).size).toBe(42)
  })

  it('les 8 contextes des maquettes 01/02 sont les plus récents, dans l’ordre', () => {
    const recent = [...contexts]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .slice(0, 8)
    expect(recent.map((c) => c.title)).toEqual(contexts.slice(0, 8).map((c) => c.title))
  })

  it('« pinia ssr » en portée Équipe ne donne aucun résultat (maquette 07)', () => {
    const team = contexts.filter((c) => c.scope.kind === 'team')
    const haystacks = team.map((c) =>
      [c.title, c.description, ...c.tags, c.publishedVersion?.content ?? c.draft?.content ?? '']
        .join(' ')
        .toLowerCase(),
    )
    expect(haystacks.filter((text) => text.includes('pinia') && text.includes('ssr'))).toEqual([])
  })
})
