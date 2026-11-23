import { describe, expect, it } from 'vitest'

import { TaxonomyRuleError } from '../shared/errors.ts'
import {
  canDeleteCollection,
  canRenameCollection,
  deletionTargets,
  planCollectionDeletion,
} from './collections.ts'
import { UNCATEGORIZED_COLLECTION_ID, type Collection } from './types.ts'

const collection = (id: string, name: string, system?: true): Collection => ({
  id,
  name,
  description: '',
  contextCount: 0,
  publishedCount: 0,
  ...(system ? { system } : {}),
})

const NONE = collection(UNCATEGORIZED_COLLECTION_ID, 'Sans collection', true)
const CICD = collection('cicd', 'CI/CD')
const NUXT = collection('nuxt', 'Nuxt')
const ALL = [NUXT, CICD, NONE]

describe('collection système', () => {
  it('« Sans collection » n’est ni renommable ni supprimable', () => {
    expect(canRenameCollection(NONE)).toBe(false)
    expect(canDeleteCollection(NONE)).toBe(false)
    expect(canRenameCollection(NUXT)).toBe(true)
    expect(canDeleteCollection(NUXT)).toBe(true)
  })
})

describe('deletionTargets', () => {
  it('propose toutes les autres collections, système comprise', () => {
    expect(deletionTargets(ALL, 'cicd')).toEqual([NUXT, NONE])
  })
})

describe('planCollectionDeletion', () => {
  it('valide une suppression avec cible et tag de l’ancien nom', () => {
    expect(
      planCollectionDeletion(ALL, {
        deletedId: 'cicd',
        targetId: 'none',
        addFormerNameAsTag: true,
      }),
    ).toEqual({
      deleted: CICD,
      target: NONE,
      tagToAdd: 'ci-cd',
    })
  })

  it('n’ajoute pas de tag si l’option est décochée', () => {
    expect(
      planCollectionDeletion(ALL, {
        deletedId: 'cicd',
        targetId: 'nuxt',
        addFormerNameAsTag: false,
      }).tagToAdd,
    ).toBeNull()
  })

  it.each([
    [{ deletedId: 'cicd', targetId: null }, 'deletion-target-required'],
    [{ deletedId: 'cicd', targetId: 'cicd' }, 'deletion-target-invalid'],
    [{ deletedId: 'cicd', targetId: 'inconnue' }, 'deletion-target-invalid'],
    [{ deletedId: 'none', targetId: 'nuxt' }, 'system-collection-immutable'],
    [{ deletedId: 'inconnue', targetId: 'nuxt' }, 'unknown-collection'],
  ] as const)('refuse %o (%s)', (request, violation) => {
    let caught: unknown
    try {
      planCollectionDeletion(ALL, { ...request, addFormerNameAsTag: false })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(TaxonomyRuleError)
    expect(caught).toMatchObject({ violation })
  })
})
