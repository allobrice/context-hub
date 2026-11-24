/**
 * Serveur MCP, testé avec le client du SDK connecté en process (fetch → app.request), dans les
 * deux protocoles : 2025 (sessions, défaut du client) et 2026-07-28 (createMcpHandler).
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { ContextDetailSchema } from '@context-hub/domain/schemas/context.ts'

import { TEST_TOKEN } from '../../test/testDatabase.ts'
import { MAX_LEGACY_SESSIONS_PER_USER } from './legacySessions.ts'
import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../test/testApp.ts'

const RECORDS = CONTEXT_FIXTURES
const FIXTURES = RECORDS.map((record) => record.context)
const NUXT4 = RECORDS.find((record) => record.context.slug === 'nuxt/conventions-nuxt-4')
const PERSONAL = FIXTURES.find((c) => c.scope.kind === 'personal' && c.status === 'published')
const DRAFT_ONLY = FIXTURES.find((c) => c.status === 'draft' && c.publishedVersion === null)
const ARCHIVED = FIXTURES.find((c) => c.status === 'archived' && c.publishedVersion !== null)
const MCP_URL = new URL('http://localhost/mcp')
const MODERN = { versionNegotiation: { mode: { pin: '2026-07-28' } } } as const

type Era = 'legacy' | 'modern'

/** Sortie attendue de `search_contexts` : strictement ces champs, jamais le contenu. */
const SearchOutputSchema = z.object({
  results: z.array(
    z.strictObject({
      title: z.string(),
      description: z.string(),
      uri: z.string(),
      version: z.number().int(),
      tokenEstimate: z.number().int(),
    }),
  ),
})

function searchResults(result: { structuredContent?: unknown }) {
  return SearchOutputSchema.parse(result.structuredContent).results
}

interface ConnectOptions {
  readonly token?: string
  readonly repo?: string
  readonly era?: Era
}

let api: TestApp
const clients: Client[] = []

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await api.close()
})

async function connect({ token = TEST_TOKEN, repo, era = 'legacy' }: ConnectOptions = {}) {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (repo !== undefined) headers['X-Context-Hub-Repo'] = repo
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    fetch: api.fetch,
    requestInit: { headers },
  })
  const client = new Client(
    { name: 'context-hub-tests', version: '1.0.0' },
    era === 'modern' ? MODERN : {},
  )
  await client.connect(transport)
  clients.push(client)
  return { client, transport }
}

function textOf(result: { contents: readonly unknown[] }): string {
  const [first] = result.contents
  return typeof first === 'object' &&
    first !== null &&
    'text' in first &&
    typeof first.text === 'string'
    ? first.text
    : ''
}

/** Crée puis publie un contexte d'équipe par l'API REST. */
async function publishNewContext(slug: string): Promise<void> {
  const draft: ContextDraftInput = {
    title: 'Publié pendant la session',
    slug,
    description: 'Déclenche list_changed',
    collectionId: null,
    tags: [],
    scope: { kind: 'team', team: 'allovoisins' },
    content: '# Nouveau',
    versionNote: 'v1',
  }
  const created = ContextDetailSchema.parse(
    await (await api.request('/api/contexts', { method: 'POST', body: draft })).json(),
  )
  const published = await api.request(`/api/contexts/${created.context.id}/publish`, {
    method: 'POST',
    body: { baseVersion: null, note: 'v1' },
  })
  expect(published.status).toBe(200)
}

describe.each<Era>(['legacy', 'modern'])('MCP (%s)', (era) => {
  it('passe par la branche de son protocole (sessions 2025, ou createMcpHandler)', async () => {
    await connect({ era })
    expect(api.mcp.legacySessions.size).toBe(era === 'legacy' ? 1 : 0)
  })

  it('liste les contextes publiés visibles, avec titre et description', async () => {
    const { client } = await connect({ era })
    const resources = (await client.listResources()).resources.filter((r) =>
      r.uri.startsWith('context://'),
    )
    const visiblePublished = FIXTURES.filter((c) => c.status === 'published')
    expect(resources).toHaveLength(visiblePublished.length)
    expect(resources.find((r) => r.uri === 'context://nuxt/conventions-nuxt-4')).toMatchObject({
      name: 'nuxt/conventions-nuxt-4',
      title: NUXT4?.context.title,
      description: NUXT4?.context.description,
      mimeType: 'text/markdown',
    })
    const templates = (await client.listResourceTemplates()).resourceTemplates.map(
      (t) => t.uriTemplate,
    )
    expect(templates).toEqual([
      'context://{+slug}@{version}',
      'context://{+slug}',
      'workspace://{slug}',
    ])
  })

  it('lit la dernière version publiée et une version figée, en text/markdown', async () => {
    if (!NUXT4?.context.publishedVersion) throw new Error('fixture manquante')
    const { client } = await connect({ era })
    const latest = await client.readResource({ uri: 'context://nuxt/conventions-nuxt-4' })
    expect(latest.contents[0]).toMatchObject({ mimeType: 'text/markdown' })
    expect(textOf(latest)).toBe(NUXT4.context.publishedVersion.content)
    const oldest = NUXT4.history.at(-1)
    if (!oldest) throw new Error('fixture manquante')
    const pinned = await client.readResource({
      uri: `context://nuxt/conventions-nuxt-4@${oldest.number}`,
    })
    expect(textOf(pinned)).toBe(oldest.content)
  })

  it('ne sert jamais un brouillon, un archivé ni une version inexistante', async () => {
    if (!DRAFT_ONLY || !ARCHIVED) throw new Error('fixture manquante')
    const { client } = await connect({ era })
    await expect(client.readResource({ uri: `context://${DRAFT_ONLY.slug}` })).rejects.toThrow()
    await expect(client.readResource({ uri: `context://${ARCHIVED.slug}` })).rejects.toThrow()
    await expect(
      client.readResource({ uri: 'context://nuxt/conventions-nuxt-4@99' }),
    ).rejects.toThrow()
    // Le brouillon v5 (en cours au-dessus de la v4) n'est pas lisible non plus.
    await expect(
      client.readResource({ uri: 'context://nuxt/conventions-nuxt-4@5' }),
    ).rejects.toThrow()
  })

  it('search_contexts : métadonnées sans contenu, sur le contenu publié seulement', async () => {
    const { client } = await connect({ era })
    const result = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'nuxt', limit: 5 },
    })
    const results = searchResults(result)
    expect(results.length).toBeGreaterThan(0)
    expect(results.length).toBeLessThanOrEqual(5)
    // « useRuntimeConfig » n'existe que dans le brouillon v5 de Conventions Nuxt 4.
    const draftTerm = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'useRuntimeConfig' },
    })
    expect(draftTerm.structuredContent).toEqual({ results: [] })
  })

  it('search_contexts : refuse une limite au-delà de 20', async () => {
    const { client } = await connect({ era })
    const result = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'nuxt', limit: 21 },
    })
    expect(result.isError).toBe(true)
  })

  it('get_context : contenu publié ou version demandée, comme ressource embarquée', async () => {
    if (!NUXT4?.context.publishedVersion) throw new Error('fixture manquante')
    const { client } = await connect({ era })
    const result = await client.callTool({
      name: 'get_context',
      arguments: { slug: 'nuxt/conventions-nuxt-4' },
    })
    expect(result.content).toEqual([
      {
        type: 'resource',
        resource: {
          uri: 'context://nuxt/conventions-nuxt-4',
          mimeType: 'text/markdown',
          text: NUXT4.context.publishedVersion.content,
        },
      },
    ])
    const missing = await client.callTool({
      name: 'get_context',
      arguments: { slug: 'inconnu/nulle-part' },
    })
    expect(missing.isError).toBe(true)
  })

  it('refuse un contexte personnel d’un autre utilisateur', async () => {
    if (!PERSONAL) throw new Error('fixture manquante')
    const own = await connect({ era })
    expect(textOf(await own.client.readResource({ uri: `context://${PERSONAL.slug}` }))).not.toBe(
      '',
    )
    const other = await connect({ era, token: CAMILLE_TOKEN })
    await expect(other.client.readResource({ uri: `context://${PERSONAL.slug}` })).rejects.toThrow()
    const viaTool = await other.client.callTool({
      name: 'get_context',
      arguments: { slug: PERSONAL.slug },
    })
    expect(viaTool.isError).toBe(true)
    const listed = (await other.client.listResources()).resources.map((r) => r.uri)
    expect(listed).not.toContain(`context://${PERSONAL.slug}`)
  })
})

describe('MCP : pertinence par repo (X-Context-Hub-Repo)', () => {
  it('remonte les contextes du repo en tête et exclut ceux des autres repos', async () => {
    const { client } = await connect({ repo: 'allovoisins/front' })
    const result = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'conventions', limit: 20 },
    })
    const uris = searchResults(result).map((r) => r.uri)
    const scopeOf = (uri: string) =>
      FIXTURES.find((c) => `context://${c.slug}` === uri)?.scope ?? { kind: 'team', team: '' }
    const scopes = uris.map(scopeOf)
    expect(scopes.some((s) => s.kind === 'project' && s.repo !== 'allovoisins/front')).toBe(false)
    const firstOther = scopes.findIndex(
      (s) => !(s.kind === 'project' && s.repo === 'allovoisins/front'),
    )
    const lastOwn = scopes.findLastIndex(
      (s) => s.kind === 'project' && s.repo === 'allovoisins/front',
    )
    expect(lastOwn).toBeGreaterThanOrEqual(0)
    if (firstOther >= 0) expect(lastOwn).toBeLessThan(firstOther)
  })
})

describe('MCP : journal des lectures', () => {
  it('écrit chaque lecture dans mcp_reads, sans contenu dans les logs', async () => {
    if (!NUXT4?.context.publishedVersion) throw new Error('fixture manquante')
    const { client } = await connect()
    await client.readResource({ uri: 'context://nuxt/conventions-nuxt-4' })
    await client.callTool({ name: 'get_context', arguments: { slug: 'nuxt/conventions-nuxt-4' } })
    const detail = ContextDetailSchema.parse(
      await (await api.request(`/api/contexts/${NUXT4.context.id}`)).json(),
    )
    expect(detail.context.mcpReads7d).toBe(NUXT4.context.mcpReads7d + 2)
    const serialized = JSON.stringify(api.logs)
    expect(serialized).toContain('mcp.resource_read')
    expect(serialized).not.toContain(NUXT4.context.publishedVersion.content.slice(0, 60))
    expect(serialized).not.toContain(TEST_TOKEN)
  })
})

describe('MCP : notifications/resources/list_changed', () => {
  it('est reçue par une session 2025 ouverte après une publication', async () => {
    const { client } = await connect()
    const received = vi.fn()
    client.setNotificationHandler('notifications/resources/list_changed', received)
    // Laisse le client ouvrir son flux GET (SSE) de session.
    await vi.waitFor(() => {
      expect(api.mcp.legacySessions.size).toBe(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await publishNewContext('tests/publie-en-session')
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalled()
    })
  })

  it('est reçue par un client 2026-07-28 abonné (subscriptions/listen)', async () => {
    const { client } = await connect({ era: 'modern' })
    const received = vi.fn()
    client.setNotificationHandler('notifications/resources/list_changed', received)
    const subscription = await client.listen({ resourcesListChanged: true })
    await publishNewContext('tests/publie-en-ecoute')
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalled()
    })
    await subscription.close()
  })

  it('est émise aussi à l’archivage', async () => {
    if (!NUXT4) throw new Error('fixture manquante')
    const { client } = await connect()
    const received = vi.fn()
    client.setNotificationHandler('notifications/resources/list_changed', received)
    await new Promise((resolve) => setTimeout(resolve, 50))
    await api.request(`/api/contexts/${NUXT4.context.id}/archive`, { method: 'POST' })
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalled()
    })
  })
})

describe('MCP : protections HTTP', () => {
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'raw', version: '1.0.0' },
    },
  }

  async function post(headers: Record<string, string>): Promise<Response> {
    return api.fetch(MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify(initialize),
    })
  }

  it('exige un jeton Bearer valide (401)', async () => {
    expect((await post({})).status).toBe(401)
    expect((await post({ Authorization: 'Bearer chub_inconnu' })).status).toBe(401)
  })

  it('refuse un Host non autorisé (DNS rebinding) et une Origin étrangère (403)', async () => {
    const auth = { Authorization: `Bearer ${TEST_TOKEN}` }
    const rebound = await api.fetch(new URL('http://evil.example/mcp'), {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(initialize),
    })
    expect(rebound.status).toBe(403)
    expect((await post({ ...auth, Origin: 'https://evil.example' })).status).toBe(403)
    expect((await post({ ...auth, Origin: 'http://localhost:6274' })).status).toBe(200)
  })

  it('plafonne les sessions ouvertes par un même utilisateur (429), pas celles des autres', async () => {
    const auth = { Authorization: `Bearer ${TEST_TOKEN}` }
    for (let index = 0; index < MAX_LEGACY_SESSIONS_PER_USER; index += 1) {
      expect((await post(auth)).status).toBe(200)
    }
    expect((await post(auth)).status).toBe(429)
    expect((await post({ Authorization: `Bearer ${CAMILLE_TOKEN}` })).status).toBe(200)
  })

  it('refuse qu’un autre utilisateur reprenne une session ouverte (404)', async () => {
    const { transport } = await connect()
    const sessionId = transport.sessionId
    if (sessionId === undefined) throw new Error('session absente')
    const hijack = await post({
      Authorization: `Bearer ${CAMILLE_TOKEN}`,
      'Mcp-Session-Id': sessionId,
    })
    expect(hijack.status).toBe(404)
  })
})
