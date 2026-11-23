import { describe, expect, it } from 'vitest'

import { aVersion } from '../test-utils/fixtures.ts'
import { generateSlug, isSlugEditable, isValidSlug, slugify } from './slug.ts'

describe('slugify', () => {
  it.each([
    [
      'Conventions Nuxt 4 — composables & auto-imports',
      'conventions-nuxt-4-composables-auto-imports',
    ],
    ['Règles de revue de code', 'regles-de-revue-de-code'],
    ['Migration Vue 2.7 → 3', 'migration-vue-2-7-3'],
    ['  --  ', ''],
  ])('« %s » → « %s »', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })
})

describe('generateSlug', () => {
  it('préfixe par la collection', () => {
    expect(generateSlug({ title: 'Conventions Nuxt 4', collectionName: 'Nuxt' })).toBe(
      'nuxt/conventions-nuxt-4',
    )
  })

  it('n’a pas de préfixe sans collection', () => {
    expect(generateSlug({ title: 'Prompts de debug', collectionName: null })).toBe(
      'prompts-de-debug',
    )
  })

  it('reste valide tant que le titre est vide', () => {
    expect(generateSlug({ title: '', collectionName: 'CI/CD' })).toBe('ci-cd')
    expect(generateSlug({ title: '', collectionName: null })).toBe('')
  })
})

describe('isValidSlug', () => {
  it.each(['nuxt/conventions-nuxt-4', 'wording', 'a/b/c-1'])('accepte %s', (slug) => {
    expect(isValidSlug(slug)).toBe(true)
  })

  it.each(['', 'Nuxt/x', 'nuxt//x', '-x', 'x-', 'x/', 'é'])('refuse « %s »', (slug) => {
    expect(isValidSlug(slug)).toBe(false)
  })
})

describe('isSlugEditable', () => {
  it('est modifiable à la création et avant la première publication', () => {
    expect(isSlugEditable(null)).toBe(true)
    expect(isSlugEditable({ publishedVersion: null })).toBe(true)
  })

  it('est figé dès qu’une version est publiée', () => {
    expect(isSlugEditable({ publishedVersion: aVersion() })).toBe(false)
  })
})
