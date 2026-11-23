import { describe, expect, it } from 'vitest'

import {
  applyTagMerge,
  findSimilarTags,
  isValidTagName,
  mergeImpact,
  normalizeTagName,
  planTagRename,
} from './tags.ts'
import type { Tag } from './types.ts'

const tag = (name: string, contextCount = 1): Tag => ({
  name,
  contextCount,
  publishedCount: 0,
  lastUsedAt: null,
})
const TAGS = [tag('vue', 8), tag('vue3', 5), tag('vuejs', 2), tag('nuxt', 9), tag('a11y', 3)]

describe('noms de tag', () => {
  it('normalise la saisie', () => {
    expect(normalizeTagName('  Data-Fetching ')).toBe('data-fetching')
  })

  it.each(['a11y', 'github-actions', 'qualité', 'i18n'])('accepte %s', (name) => {
    expect(isValidTagName(name)).toBe(true)
  })

  it.each(['', '-vue', 'vue js', 'Vue', 'vue_3'])('refuse « %s »', (name) => {
    expect(isValidTagName(name)).toBe(false)
  })
})

describe('planTagRename', () => {
  it('renomme vers un nom libre', () => {
    expect(planTagRename(TAGS, 'vue3', 'vue-3')).toEqual({
      kind: 'rename',
      from: 'vue3',
      to: 'vue-3',
    })
  })

  it('renommer vers un nom existant revient à fusionner', () => {
    expect(planTagRename(TAGS, 'vue3', ' Vue ')).toEqual({
      kind: 'merge',
      from: 'vue3',
      into: tag('vue', 8),
    })
  })

  it('ne fait rien si le nom est identique, refuse un nom invalide', () => {
    expect(planTagRename(TAGS, 'vue3', 'vue3')).toEqual({ kind: 'unchanged' })
    expect(planTagRename(TAGS, 'vue3', 'vue 3')).toEqual({ kind: 'invalid' })
  })
})

describe('applyTagMerge', () => {
  it('remplace les sources par la cible sans doublon, en gardant l’ordre', () => {
    expect(applyTagMerge(['vue3', 'pinia', 'vue', 'vuejs'], ['vue3', 'vuejs'], 'vue')).toEqual([
      'vue',
      'pinia',
    ])
    expect(applyTagMerge(['nuxt'], ['vue3'], 'vue')).toEqual(['nuxt'])
  })
})

describe('mergeImpact', () => {
  it('compte les contextes concernés et les doublons évités', () => {
    const contexts = [
      { tags: ['vue3'] },
      { tags: ['vue', 'vue3'] },
      { tags: ['vuejs', 'vue3'] },
      { tags: ['nuxt'] },
      { tags: ['vue'] },
    ]
    expect(mergeImpact(contexts, ['vue3', 'vuejs'], 'vue')).toEqual({
      affectedContexts: 3,
      duplicatesAvoided: 2,
    })
  })

  it('ignore la cible si elle figure parmi les sources', () => {
    expect(mergeImpact([{ tags: ['vue'] }], ['vue'], 'vue')).toEqual({
      affectedContexts: 0,
      duplicatesAvoided: 0,
    })
  })
})

describe('findSimilarTags', () => {
  it('regroupe vue / vue3 / vuejs', () => {
    expect(findSimilarTags(TAGS)).toEqual([['vue', 'vue3', 'vuejs']])
  })

  it('ne regroupe rien sans synonyme', () => {
    expect(findSimilarTags([tag('nuxt'), tag('pinia')])).toEqual([])
  })
})
