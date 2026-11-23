import { describe, expect, it } from 'vitest'

import { RepositoryUnavailableError } from '../../application/errors.ts'
import { DEFAULT_LIBRARY_CRITERIA } from '../../domain/library/criteria.ts'
import { createInMemoryServices } from '../createInMemoryServices.ts'
import type { MockMode } from './mockMode.ts'
import { parseMockMode } from './mockMode.ts'

const servicesIn = (mode: MockMode) =>
  createInMemoryServices({ mode: () => mode, latencyMs: 0, slowLatencyMs: 0 })

describe('InMemoryContextRepository.search', () => {
  it('pagine par 25, trié du plus récent au plus ancien, avec les totaux', async () => {
    const { page, totals } = await servicesIn('normal').contexts.search(DEFAULT_LIBRARY_CRITERIA)
    expect(page).toMatchObject({ total: 42, from: 1, to: 25, pageCount: 2 })
    expect(page.items[0]?.title).toBe('Conventions Nuxt 4 — composables & auto-imports')
    expect(totals).toEqual({ total: 42, published: 31, draft: 8, archived: 3 })
  })

  it('applique recherche et filtres, totaux inchangés', async () => {
    const { page, totals } = await servicesIn('normal').contexts.search({
      ...DEFAULT_LIBRARY_CRITERIA,
      query: 'pinia ssr',
      scope: 'team',
    })
    expect(page.total).toBe(0)
    expect(totals.total).toBe(42)
  })

  it('mode empty : bibliothèque vide', async () => {
    const { page, totals } = await servicesIn('empty').contexts.search(DEFAULT_LIBRARY_CRITERIA)
    expect(page.total).toBe(0)
    expect(totals.total).toBe(0)
  })

  it('mode error : erreur de stockage des maquettes', async () => {
    const search = servicesIn('error').contexts.search(DEFAULT_LIBRARY_CRITERIA)
    await expect(search).rejects.toBeInstanceOf(RepositoryUnavailableError)
    await expect(search).rejects.toMatchObject({
      summary: 'SQLITE_BUSY · database is locked · req 7f3a91',
    })
  })

  it('mode loading : ne répond jamais', async () => {
    const outcome = await Promise.race([
      servicesIn('loading')
        .contexts.search(DEFAULT_LIBRARY_CRITERIA)
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

describe('InMemoryWorkspaceRepository.getOverview', () => {
  it('reste disponible en mode error et loading (sidebar des maquettes 05/06)', async () => {
    for (const mode of ['error', 'loading'] as const) {
      const overview = await servicesIn(mode).workspace.getOverview()
      expect(overview.contextCount).toBe(42)
    }
  })

  it('expose collections, portées et tags', async () => {
    const overview = await servicesIn('normal').workspace.getOverview()
    expect(overview.collections.map((c) => [c.name, c.contextCount])).toEqual([
      ['Nuxt', 9],
      ['Vue', 8],
      ['Conventions AlloVoisins', 7],
      ['Review', 6],
      ['CI/CD', 4],
      ['Sans collection', 8],
    ])
    expect(overview.scopeCounts).toEqual({ personal: 5, project: 12, team: 25 })
    expect(overview.tagNames).toHaveLength(34)
  })

  it('mode empty : aucun compteur', async () => {
    const overview = await servicesIn('empty').workspace.getOverview()
    expect(overview).toMatchObject({
      contextCount: 0,
      collections: [],
      scopeCounts: { personal: 0, project: 0, team: 0 },
    })
  })
})

describe('parseMockMode', () => {
  it('reconnaît les modes et ignore le reste', () => {
    expect(parseMockMode('?mock=error')).toBe('error')
    expect(parseMockMode('?view=cards&mock=slow')).toBe('slow')
    expect(parseMockMode('?mock=nimporte')).toBe('normal')
    expect(parseMockMode('')).toBe('normal')
  })
})
