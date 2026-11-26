import type { Context, ContextVersion } from '../context/types.ts'
import { toContextId } from '../context/types.ts'

/** Fabriques minimales pour les tests du domaine (pas les fixtures de démo). */
export function aVersion(overrides: Partial<ContextVersion> = {}): ContextVersion {
  return {
    number: 1,
    content: '# Titre',
    note: 'Version initiale',
    author: 'Brice',
    createdAt: '2026-09-03T10:21:00Z',
    tokenEstimate: 2,
    ...overrides,
  }
}

export function aContext(overrides: Partial<Context> = {}): Context {
  return {
    id: toContextId('ctx-1'),
    slug: 'nuxt/conventions-nuxt-4',
    title: 'Conventions Nuxt 4',
    description: 'Structure app/',
    collectionId: 'nuxt',
    tags: ['nuxt'],
    scope: { kind: 'team', team: 'allovoisins' },
    status: 'published',
    publishedVersion: aVersion(),
    draft: null,
    createdAt: '2026-09-03T10:21:00Z',
    updatedAt: '2026-11-23T09:12:00Z',
    author: 'Brice',
    mcpReads7d: 0,
    exposeAsPrompt: false,
    ...overrides,
  }
}
