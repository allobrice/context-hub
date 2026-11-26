/**
 * Prompts MCP (SPEC §8.5) : seuls les contextes PUBLIÉS et visibles marqués `exposeAsPrompt` sont
 * listés ; le marquage d'un brouillon n'a aucun effet avant publication.
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ContextDetailSchema } from '@context-hub/domain/schemas/context.ts'

import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../test/testApp.ts'
import { TEST_TOKEN } from '../../test/testDatabase.ts'

const MCP_URL = new URL('http://localhost/mcp')
const MODERN = { versionNegotiation: { mode: { pin: '2026-07-28' } } } as const
const CHECKLIST = 'review-checklist-accessibilite-des-composants'

let api: TestApp
const clients: Client[] = []

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await api.close()
})

async function connect(era: 'legacy' | 'modern' = 'legacy', token = TEST_TOKEN) {
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    fetch: api.fetch,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client(
    { name: 'context-hub-tests', version: '1.0.0' },
    era === 'modern' ? MODERN : {},
  )
  await client.connect(transport)
  clients.push(client)
  return client
}

async function promptNames(client: Client): Promise<string[]> {
  return (await client.listPrompts()).prompts.map((prompt) => prompt.name)
}

describe.each(['legacy', 'modern'] as const)('prompts MCP (%s)', (era) => {
  it('liste les contextes publiés marqués exposeAsPrompt, et sert leur contenu publié', async () => {
    const client = await connect(era)
    expect(await promptNames(client)).toEqual([CHECKLIST])
    const prompt = await client.getPrompt({ name: CHECKLIST })
    const [message] = prompt.messages
    expect(message?.role).toBe('user')
    expect(message?.content).toMatchObject({ type: 'text' })
    expect(JSON.stringify(message?.content)).toContain('Checklist accessibilité des composants')
  })

  it('un nom inconnu est refusé', async () => {
    const client = await connect(era)
    await expect(client.getPrompt({ name: 'inconnu' })).rejects.toThrow(/Prompt inconnu/)
  })
})

describe('marquage exposeAsPrompt', () => {
  it('n’a d’effet qu’une fois publié, et n’est pas effacé par un client qui l’ignore', async () => {
    const client = await connect()
    const reference = encodeURIComponent('nuxt/conventions-nuxt-4')
    const { context } = ContextDetailSchema.parse(
      await (await api.request(`/api/contexts/${reference}`)).json(),
    )
    const current = context.publishedVersion
    if (current === null) throw new Error('contexte de démo non publié')
    const draft = {
      title: context.title,
      slug: context.slug,
      description: context.description,
      collectionId: context.collectionId,
      tags: context.tags,
      scope: context.scope,
      content: `${current.content}\n\nAjout.`,
      versionNote: 'Exposer comme prompt',
    }
    const baseVersion = current.number
    const saved = await api.request(`/api/contexts/${reference}/draft`, {
      method: 'PUT',
      body: { baseVersion, draft: { ...draft, exposeAsPrompt: true } },
    })
    expect(saved.status).toBe(200)
    expect(await promptNames(client)).toEqual([CHECKLIST])

    // Un client qui ne connaît pas le champ réenregistre : le marquage est conservé.
    await api.request(`/api/contexts/${reference}/draft`, {
      method: 'PUT',
      body: { baseVersion, draft },
    })
    const published = await api.request(`/api/contexts/${reference}/publish`, {
      method: 'POST',
      body: { baseVersion, note: 'Exposer comme prompt' },
    })
    expect(published.status).toBe(200)
    expect(await promptNames(client)).toEqual(['nuxt-conventions-nuxt-4', CHECKLIST])
  })

  it('applique les portées : Camille voit les prompts d’équipe', async () => {
    const client = await connect('legacy', CAMILLE_TOKEN)
    expect(await promptNames(client)).toEqual([CHECKLIST])
  })
})
