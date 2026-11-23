import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { COLLECTION_FIXTURES } from '@context-hub/domain/fixtures/collections.ts'
import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { TAG_FIXTURES } from '@context-hub/domain/fixtures/tags.ts'
import { mergeImpact } from '@context-hub/domain/taxonomy/tags.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import { BRICE, createTestDatabase, type TestDatabase } from '../../../test/testDatabase.ts'

const FIXTURES = CONTEXT_FIXTURES.map((record) => record.context)
const AT = new Date('2026-11-23T10:30:00Z')

let database: TestDatabase

beforeEach(() => {
  database = createTestDatabase()
})

afterEach(() => {
  database.close()
})

async function tagsOf(slug: string): Promise<readonly string[]> {
  return (await database.contexts.find(BRICE, slug))?.context.tags ?? []
}

describe('DrizzleTaxonomyStore : tags', () => {
  it('reprend les 34 tags du registre avec les compteurs des fixtures', async () => {
    const tags = await database.taxonomy.listTags(BRICE)
    expect(tags).toHaveLength(TAG_FIXTURES.length)
    for (const tag of tags) {
      const carriers = FIXTURES.filter((context) => context.tags.includes(tag.name))
      expect(tag, tag.name).toMatchObject({
        contextCount: carriers.length,
        publishedCount: carriers.filter((context) => context.status === 'published').length,
      })
    }
  })

  it('fournit de quoi chiffrer une fusion (vue3 + vuejs → vue : maquette 17)', async () => {
    const assignments = await database.taxonomy.tagAssignments()
    expect(mergeImpact(assignments, ['vue3', 'vuejs'], 'vue')).toEqual(
      mergeImpact(FIXTURES, ['vue3', 'vuejs'], 'vue'),
    )
  })

  it('repère les tags inconnus', async () => {
    expect(await database.taxonomy.unknownTags(['vue', 'nope', 'nuxt'])).toEqual(['nope'])
  })

  it('fusionne sans doublon et retire les tags sources du registre', async () => {
    const carrier = FIXTURES.find((c) => c.tags.includes('vue3') && c.tags.includes('vue'))
    expect(carrier).toBeDefined()
    if (!carrier) return
    await database.taxonomy.replaceTags({
      sources: ['vue3', 'vuejs', 'vue'],
      target: 'vue',
      at: AT,
    })
    const tags = await tagsOf(carrier.slug)
    expect(tags.filter((tag) => tag === 'vue')).toHaveLength(1)
    expect(tags).not.toContain('vue3')
    expect(await database.taxonomy.unknownTags(['vue3', 'vuejs', 'vue'])).toEqual(['vue3', 'vuejs'])
    const { page } = await database.contexts.search(BRICE, {
      query: '',
      tags: ['vue3'],
      collectionId: null,
      scope: null,
      status: null,
      sort: 'updated-desc',
      page: 1,
    })
    expect(page.total).toBe(0)
  })

  it('renomme vers un nouveau nom (créé au registre)', async () => {
    await database.taxonomy.replaceTags({ sources: ['a11y'], target: 'accessibilite', at: AT })
    const tags = await database.taxonomy.listTags(BRICE)
    const renamed = tags.find((tag) => tag.name === 'accessibilite')
    expect(renamed?.contextCount).toBe(FIXTURES.filter((c) => c.tags.includes('a11y')).length)
    expect(renamed?.lastUsedAt).toBe(AT.toISOString())
    expect(tags.some((tag) => tag.name === 'a11y')).toBe(false)
  })

  it('supprime des tags de tous les contextes et du registre', async () => {
    await database.taxonomy.deleteTags(['nuxt'])
    const nuxt = FIXTURES.find((c) => c.tags.includes('nuxt'))
    if (!nuxt) return
    expect(await tagsOf(nuxt.slug)).not.toContain('nuxt')
    expect(await database.taxonomy.unknownTags(['nuxt'])).toEqual(['nuxt'])
  })
})

describe('DrizzleTaxonomyStore : collections', () => {
  it('reprend les collections dans l’ordre, système en dernier, avec leurs compteurs', async () => {
    const collections = await database.taxonomy.listCollections(BRICE)
    expect(collections.map((c) => c.id)).toEqual(COLLECTION_FIXTURES.map((c) => c.id))
    for (const collection of collections) {
      const members = FIXTURES.filter(
        (c) => (c.collectionId ?? UNCATEGORIZED_COLLECTION_ID) === collection.id,
      )
      expect(collection, collection.id).toMatchObject({
        contextCount: members.length,
        publishedCount: members.filter((c) => c.status === 'published').length,
      })
    }
    expect(collections.at(-1)?.system).toBe(true)
  })

  it('crée une collection avec un identifiant unique, avant la collection système', async () => {
    const first = await database.taxonomy.createCollection({ name: ' Nuxt ', description: 'Bis' })
    expect(first).toMatchObject({ id: 'nuxt-2', name: 'Nuxt', contextCount: 0 })
    const collections = await database.taxonomy.listCollections(BRICE)
    expect(collections.at(-2)?.id).toBe('nuxt-2')
    expect(collections.at(-1)?.id).toBe(UNCATEGORIZED_COLLECTION_ID)
  })

  it('renomme une collection, jamais la collection système', async () => {
    expect(
      await database.taxonomy.updateCollection('vue', { name: 'Vue.js', description: '' }),
    ).toBe(true)
    expect(
      await database.taxonomy.updateCollection(UNCATEGORIZED_COLLECTION_ID, {
        name: 'Autre',
        description: '',
      }),
    ).toBe(false)
    expect(
      await database.taxonomy.updateCollection('inconnue', { name: 'X', description: '' }),
    ).toBe(false)
  })

  it('supprime une collection en déplaçant ses contextes et en ajoutant l’ancien nom en tag', async () => {
    const members = FIXTURES.filter((c) => c.collectionId === 'review')
    expect(members.length).toBeGreaterThan(0)
    await database.taxonomy.deleteCollection({
      deletedId: 'review',
      targetId: null,
      tagToAdd: 'ex-review',
      at: AT,
    })
    for (const member of members) {
      const detail = await database.contexts.find(BRICE, member.id)
      expect(detail?.context.collectionId).toBeNull()
      expect(detail?.context.tags.at(-1)).toBe('ex-review')
    }
    const collections = await database.taxonomy.listCollections(BRICE)
    expect(collections.some((c) => c.id === 'review')).toBe(false)
  })
})
