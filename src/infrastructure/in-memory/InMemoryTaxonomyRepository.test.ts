import { describe, expect, it } from 'vitest'

import { createInMemoryServices } from '../createInMemoryServices.ts'
import type { MockMode } from './mockMode.ts'

const servicesIn = (mode: MockMode = 'normal') =>
  createInMemoryServices({ mode: () => mode, latencyMs: 0, slowLatencyMs: 0 })

async function tagCount(services: ReturnType<typeof servicesIn>, name: string) {
  return (await services.taxonomy.listTags()).find((tag) => tag.name === name)?.contextCount
}

describe('InMemoryTaxonomyRepository — tags', () => {
  it('prévisualise la fusion de la maquette 17', async () => {
    expect(await servicesIn().taxonomy.previewTagMerge(['vue3', 'vuejs'], 'vue')).toEqual({
      affectedContexts: 7,
      affectedPublished: 5,
      duplicatesAvoided: 2,
    })
  })

  it('fusionne vue3 + vuejs dans vue : 8 + 7 − 2 = 13 contextes, sources supprimées', async () => {
    const services = servicesIn()
    await services.taxonomy.mergeTags(['vue3', 'vuejs'], 'vue')
    expect(await tagCount(services, 'vue')).toBe(13)
    const names = (await services.taxonomy.listTags()).map((tag) => tag.name)
    expect(names).not.toContain('vue3')
    expect(names).not.toContain('vuejs')
    expect(names).toHaveLength(32)
  })

  it('renommer vers un nom existant = fusionner ; vers un nom libre = renommer', async () => {
    const services = servicesIn()
    await services.taxonomy.renameTag('vue3', 'vue')
    expect(await tagCount(services, 'vue')).toBe(12) // 8 + 5 − 1 doublon
    await services.taxonomy.renameTag('a11y', 'accessibilite')
    expect(await tagCount(services, 'accessibilite')).toBe(3)
    expect(await tagCount(services, 'a11y')).toBeUndefined()
  })

  it('refuse un nom invalide ou un tag inconnu', async () => {
    const { taxonomy } = servicesIn()
    await expect(taxonomy.renameTag('vue3', 'Vue 3')).rejects.toMatchObject({
      violation: 'invalid-tag-name',
    })
    await expect(taxonomy.mergeTags(['inconnu'], 'vue')).rejects.toMatchObject({
      violation: 'unknown-tag',
    })
  })

  it('supprime des tags de tous les contextes', async () => {
    const services = servicesIn()
    await services.taxonomy.deleteTags(['debug', 'legacy-webpack'])
    expect((await services.taxonomy.listTags()).map((t) => t.name)).not.toContain('debug')
    const { context } = await services.contexts.get('ctx-nitro-debug')
    expect(context.tags).toEqual(['nitro'])
  })
})

describe('InMemoryTaxonomyRepository — collections', () => {
  it('supprime CI/CD en déplaçant ses 4 contextes vers « Sans collection » avec le tag ci-cd (maquette 22)', async () => {
    const services = servicesIn()
    await services.taxonomy.deleteCollection({
      deletedId: 'ci-cd',
      targetId: 'none',
      addFormerNameAsTag: true,
    })
    const collections = await services.taxonomy.listCollections()
    expect(collections.map((c) => c.id)).not.toContain('ci-cd')
    expect(collections.find((c) => c.id === 'none')?.contextCount).toBe(12)
    expect(await tagCount(services, 'ci-cd')).toBe(4)
  })

  it('protège la collection système et exige une cible', async () => {
    const { taxonomy } = servicesIn()
    await expect(
      taxonomy.updateCollection('none', { name: 'x', description: '' }),
    ).rejects.toMatchObject({
      violation: 'system-collection-immutable',
    })
    await expect(
      taxonomy.deleteCollection({ deletedId: 'vue', targetId: null, addFormerNameAsTag: false }),
    ).rejects.toMatchObject({ violation: 'deletion-target-required' })
  })

  it('renomme une collection', async () => {
    const services = servicesIn()
    const updated = await services.taxonomy.updateCollection('review', {
      name: 'Revue',
      description: 'Checklists',
    })
    expect(updated).toMatchObject({ name: 'Revue', contextCount: 6 })
  })

  it('mode loading : la liste ne répond pas ; mode empty : rien', async () => {
    expect(await servicesIn('empty').taxonomy.listTags()).toEqual([])
    const outcome = await Promise.race([
      servicesIn('loading')
        .taxonomy.listTags()
        .then(() => 'résolu'),
      new Promise((resolve) => {
        setTimeout(() => {
          resolve('en attente')
        }, 20)
      }),
    ])
    expect(outcome).toBe('en attente')
  })
})
