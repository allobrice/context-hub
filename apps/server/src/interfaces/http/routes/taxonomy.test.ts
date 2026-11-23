import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { ApiErrorSchema } from '@context-hub/domain/schemas/errors.ts'
import {
  CollectionListSchema,
  CollectionSchema,
  MergeImpactSchema,
  TagListSchema,
} from '@context-hub/domain/schemas/taxonomy.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import { createTestApp, type TestApp } from '../../../test/testApp.ts'

const FIXTURES = CONTEXT_FIXTURES.map((record) => record.context)

let api: TestApp

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(() => api.close())

async function tags() {
  return TagListSchema.parse(await (await api.request('/api/tags')).json())
}

async function collections() {
  return CollectionListSchema.parse(await (await api.request('/api/collections')).json())
}

async function errorCode(response: Response) {
  return ApiErrorSchema.parse(await response.json())
}

describe('tags', () => {
  it('GET /api/tags : les 34 tags avec leurs compteurs', async () => {
    const list = await tags()
    expect(list).toHaveLength(34)
    expect(list.find((tag) => tag.name === 'nuxt')?.contextCount).toBe(
      FIXTURES.filter((c) => c.tags.includes('nuxt')).length,
    )
  })

  it('POST /api/tags/merge/preview : impact de la maquette 17', async () => {
    const response = await api.request('/api/tags/merge/preview', {
      method: 'POST',
      body: { sources: ['vue3', 'vuejs'], target: 'vue' },
    })
    expect(MergeImpactSchema.parse(await response.json())).toEqual({
      affectedContexts: 7,
      affectedPublished: 5,
      duplicatesAvoided: 2,
    })
  })

  it('PATCH /api/tags/{name} : renomme, et vers un nom existant fusionne (204)', async () => {
    const renamed = await api.request('/api/tags/a11y', {
      method: 'PATCH',
      body: { name: 'Accessibilite' },
    })
    expect(renamed.status).toBe(204)
    const merged = await api.request('/api/tags/vuejs', { method: 'PATCH', body: { name: 'vue' } })
    expect(merged.status).toBe(204)
    const names = (await tags()).map((tag) => tag.name)
    expect(names).toContain('accessibilite')
    expect(names).not.toContain('a11y')
    expect(names).not.toContain('vuejs')
  })

  it('PATCH /api/tags/{name} encodé (accent) et refus d’un nom invalide ou d’un tag inconnu (422)', async () => {
    const accented = await api.request(`/api/tags/${encodeURIComponent('qualité')}`, {
      method: 'PATCH',
      body: { name: 'qualite' },
    })
    expect(accented.status).toBe(204)
    const invalid = await api.request('/api/tags/nuxt', { method: 'PATCH', body: { name: '!!!' } })
    expect(invalid.status).toBe(422)
    expect(await errorCode(invalid)).toMatchObject({
      code: 'TAXONOMY_RULE',
      details: { violation: 'invalid-tag-name' },
    })
    const unknown = await api.request('/api/tags/inconnu', { method: 'PATCH', body: { name: 'x' } })
    expect(await errorCode(unknown)).toMatchObject({ details: { violation: 'unknown-tag' } })
  })

  it('POST /api/tags/merge : fusionne (204), refuse une source inconnue (422) ou vide (400)', async () => {
    const merge = await api.request('/api/tags/merge', {
      method: 'POST',
      body: { sources: ['vue3', 'vuejs'], target: 'vue' },
    })
    expect(merge.status).toBe(204)
    expect((await tags()).find((tag) => tag.name === 'vue')?.contextCount).toBe(
      FIXTURES.filter((c) => c.tags.some((t) => ['vue', 'vue3', 'vuejs'].includes(t))).length,
    )
    const unknown = await api.request('/api/tags/merge', {
      method: 'POST',
      body: { sources: ['vue3'], target: 'vue' },
    })
    expect(unknown.status).toBe(422)
    const empty = await api.request('/api/tags/merge', {
      method: 'POST',
      body: { sources: [], target: 'vue' },
    })
    expect(empty.status).toBe(400)
  })

  it('DELETE /api/tags/{name} : supprime (204), puis 422 sur le même tag', async () => {
    expect((await api.request('/api/tags/nuxt', { method: 'DELETE' })).status).toBe(204)
    expect((await tags()).some((tag) => tag.name === 'nuxt')).toBe(false)
    expect((await api.request('/api/tags/nuxt', { method: 'DELETE' })).status).toBe(422)
  })
})

describe('collections', () => {
  it('GET /api/collections : dans l’ordre, système en dernier', async () => {
    const list = await collections()
    expect(list.at(-1)).toMatchObject({ id: UNCATEGORIZED_COLLECTION_ID, system: true })
  })

  it('POST /api/collections : crée (201), refuse un nom vide (400)', async () => {
    const created = await api.request('/api/collections', {
      method: 'POST',
      body: { name: 'Tests', description: 'Collection de test' },
    })
    expect(created.status).toBe(201)
    expect(CollectionSchema.parse(await created.json())).toMatchObject({
      id: 'tests',
      contextCount: 0,
    })
    const invalid = await api.request('/api/collections', {
      method: 'POST',
      body: { name: '  ', description: '' },
    })
    expect(invalid.status).toBe(400)
  })

  it('PATCH /api/collections/{id} : renomme, protège « Sans collection » (422)', async () => {
    const renamed = await api.request('/api/collections/vue', {
      method: 'PATCH',
      body: { name: 'Vue.js', description: 'Composants' },
    })
    expect(CollectionSchema.parse(await renamed.json())).toMatchObject({ name: 'Vue.js' })
    const system = await api.request(`/api/collections/${UNCATEGORIZED_COLLECTION_ID}`, {
      method: 'PATCH',
      body: { name: 'Autre', description: '' },
    })
    expect(await errorCode(system)).toMatchObject({
      details: { violation: 'system-collection-immutable' },
    })
    const unknown = await api.request('/api/collections/inconnue', {
      method: 'PATCH',
      body: { name: 'X', description: '' },
    })
    expect(await errorCode(unknown)).toMatchObject({ details: { violation: 'unknown-collection' } })
  })

  it('DELETE /api/collections/{id} : exige targetCollectionId (400), déplace les contextes (204)', async () => {
    expect((await api.request('/api/collections/review', { method: 'DELETE' })).status).toBe(400)
    const members = FIXTURES.filter((c) => c.collectionId === 'review').length
    const response = await api.request(
      '/api/collections/review?targetCollectionId=none&addFormerNameAsTag=true',
      { method: 'DELETE' },
    )
    expect(response.status).toBe(204)
    const list = await collections()
    expect(list.some((c) => c.id === 'review')).toBe(false)
    expect(list.find((c) => c.id === UNCATEGORIZED_COLLECTION_ID)?.contextCount).toBe(
      FIXTURES.filter((c) => c.collectionId === null).length + members,
    )
  })

  it('DELETE /api/collections/{id} : refuse la collection système et une cible invalide (422)', async () => {
    const system = await api.request(
      `/api/collections/${UNCATEGORIZED_COLLECTION_ID}?targetCollectionId=nuxt`,
      { method: 'DELETE' },
    )
    expect(await errorCode(system)).toMatchObject({
      details: { violation: 'system-collection-immutable' },
    })
    const sameTarget = await api.request('/api/collections/vue?targetCollectionId=vue', {
      method: 'DELETE',
    })
    expect(await errorCode(sameTarget)).toMatchObject({
      details: { violation: 'deletion-target-invalid' },
    })
  })
})
