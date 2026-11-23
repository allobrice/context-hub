/**
 * Non-régression des findings de l'audit de sécurité (phase 6). Chaque test reproduit un scénario
 * d'attaque confirmé, et vérifie qu'il est désormais refusé.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { ContextDetailSchema } from '@context-hub/domain/schemas/context.ts'
import { ApiErrorSchema } from '@context-hub/domain/schemas/errors.ts'

import { TEST_TOKEN } from '../../test/testDatabase.ts'
import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../test/testApp.ts'

/** Contexte d'équipe publié, sans brouillon, écrit par Brice. */
const TEAM = CONTEXT_FIXTURES.map((r) => r.context).find(
  (c) =>
    c.scope.kind === 'team' && c.status === 'published' && c.draft === null && c.author === 'Brice',
)

let api: TestApp
const clients: Client[] = []

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await api.close()
})

function draftOf(overrides: Record<string, unknown>) {
  if (!TEAM?.publishedVersion) throw new Error('fixture manquante')
  return {
    baseVersion: TEAM.publishedVersion.number,
    draft: {
      title: TEAM.title,
      slug: TEAM.slug,
      description: TEAM.description,
      collectionId: TEAM.collectionId,
      tags: [...TEAM.tags],
      scope: TEAM.scope,
      content: TEAM.publishedVersion.content,
      versionNote: 'Modification',
      ...overrides,
    },
  }
}

async function mcpClient(token = TEST_TOKEN) {
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
    fetch: api.fetch,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client({ name: 'audit', version: '1.0.0' })
  await client.connect(transport)
  clients.push(client)
  return client
}

describe('P0 : prise de contrôle par passage en portée personnelle', () => {
  it('refuse qu’un autre que l’auteur rende personnel un contexte d’équipe', async () => {
    if (!TEAM) throw new Error('fixture manquante')
    const response = await api.request(`/api/contexts/${TEAM.id}/draft`, {
      method: 'PUT',
      token: CAMILLE_TOKEN,
      body: draftOf({ scope: { kind: 'personal', owner: 'camille' } }),
    })
    expect(response.status).toBe(422)
    expect(ApiErrorSchema.parse(await response.json())).toMatchObject({
      details: { reasons: ['personal-scope-forbidden'] },
    })
    // Le contexte reste visible de son auteur et de l'équipe.
    expect((await api.request(`/api/contexts/${TEAM.id}`)).status).toBe(200)
    expect((await api.request(`/api/contexts/${TEAM.id}`, { token: CAMILLE_TOKEN })).status).toBe(
      200,
    )
  })
})

describe('P1 : métadonnées de brouillon servies par MCP', () => {
  it('ne sert par MCP que les métadonnées publiées, jamais celles d’un brouillon', async () => {
    if (!TEAM) throw new Error('fixture manquante')
    const saved = await api.request(`/api/contexts/${TEAM.id}/draft`, {
      method: 'PUT',
      body: draftOf({
        title: 'Titre-de-brouillon-zqx',
        description: 'Description de brouillon zqx',
        tags: ['zqxtag'],
      }),
    })
    expect(saved.status).toBe(200)
    // L'UI voit le brouillon…
    expect(ContextDetailSchema.parse(await saved.json()).context.title).toBe(
      'Titre-de-brouillon-zqx',
    )
    // … MCP non.
    const client = await mcpClient()
    const listed = (await client.listResources()).resources.find(
      (r) => r.uri === `context://${TEAM.slug}`,
    )
    expect(listed).toMatchObject({ title: TEAM.title, description: TEAM.description })
    for (const query of ['zqx', 'zqxtag', 'Titre-de-brouillon']) {
      const result = await client.callTool({ name: 'search_contexts', arguments: { query } })
      expect(result.structuredContent, query).toEqual({ results: [] })
    }
  })

  it('refuse de publier un secret dans le titre, la description, la note ou les tags', async () => {
    if (!TEAM) throw new Error('fixture manquante')
    await api.request(`/api/contexts/${TEAM.id}/draft`, {
      method: 'PUT',
      body: draftOf({ description: 'Clé : sk_live_51HxDEMOonly3kQ' }),
    })
    const response = await api.request(`/api/contexts/${TEAM.id}/publish`, {
      method: 'POST',
      body: { baseVersion: TEAM.publishedVersion?.number ?? null, note: 'v' },
    })
    expect(response.status).toBe(422)
    expect(ApiErrorSchema.parse(await response.json())).toMatchObject({
      details: { reasons: ['secret-in-metadata'] },
    })
  })
})

describe('P2 : collection inconnue', () => {
  it('répond 422 (règle de taxonomie), pas 500', async () => {
    const response = await api.request(`/api/contexts/${TEAM?.id ?? ''}/draft`, {
      method: 'PUT',
      body: draftOf({ collectionId: 'nope' }),
    })
    expect(response.status).toBe(422)
    expect(ApiErrorSchema.parse(await response.json())).toMatchObject({
      code: 'TAXONOMY_RULE',
      details: { violation: 'unknown-collection' },
    })
  })
})

describe('Métadonnées publiées et taxonomie', () => {
  it('un tag renommé suit dans les métadonnées publiées servies par MCP', async () => {
    expect(
      (await api.request('/api/tags/nuxt', { method: 'PATCH', body: { name: 'nuxt-quatre' } }))
        .status,
    ).toBe(204)
    const client = await mcpClient()
    const result = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'conventions', tags: ['nuxt-quatre'], limit: 20 },
    })
    const { results } = z
      .object({ results: z.array(z.object({ uri: z.string() })) })
      .parse(result.structuredContent)
    expect(results.map((r) => r.uri)).toContain('context://nuxt/conventions-nuxt-4')
  })
})

describe('P2 : CSRF via le proxy de dev', () => {
  it('refuse une mutation depuis une origine étrangère, accepte celle du front et les clients sans Origin', async () => {
    if (!TEAM) throw new Error('fixture manquante')
    const path = `/api/contexts/${TEAM.id}/archive`
    const foreign = await api.request(path, {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    })
    expect(foreign.status).toBe(403)
    expect(ApiErrorSchema.parse(await foreign.json()).code).toBe('FORBIDDEN_ORIGIN')
    expect(
      (await api.request(path, { method: 'POST', headers: { Origin: 'http://localhost:5173' } }))
        .status,
    ).toBe(200)
    expect(
      (await api.request(`/api/contexts/${TEAM.id}/unarchive`, { method: 'POST' })).status,
    ).toBe(200)
    // Les lectures ne sont pas concernées.
    expect(
      (
        await api.request(`/api/contexts/${TEAM.id}`, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(200)
  })
})
