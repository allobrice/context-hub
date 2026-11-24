/**
 * Surface MCP des Workspaces, testée avec le client du SDK dans les deux protocoles : mêmes
 * scénarios que l'API REST (concurrence, accès, scan), plus le format « données attribuées ».
 */
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../test/testApp.ts'
import { TEST_TOKEN } from '../../test/testDatabase.ts'

const MCP_URL = new URL('http://localhost/mcp')
const MODERN = { versionNegotiation: { mode: { pin: '2026-07-28' } } } as const
const FRONT = 'allovoisins/front'
const SLUG = 'migration-auth'
const WORKSPACE_TOOLS = [
  'propose_context',
  'workspace_claim',
  'workspace_join',
  'workspace_list',
  'workspace_post',
  'workspace_read',
  'workspace_release',
]

type Era = 'legacy' | 'modern'

let api: TestApp
const clients: Client[] = []

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()))
  await api.close()
})

async function connect({ token = TEST_TOKEN, era = 'legacy' }: { token?: string; era?: Era } = {}) {
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

interface ToolResult {
  readonly isError?: boolean | undefined
  readonly content?: unknown
}

/** Textes des blocs `text` d'un résultat d'outil. */
function texts(result: ToolResult): string[] {
  const content: unknown = result.content
  if (!Array.isArray(content)) return []
  return content.flatMap((block: unknown) =>
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    block.type === 'text' &&
    'text' in block &&
    typeof block.text === 'string'
      ? [block.text]
      : [],
  )
}

/** Dernier bloc texte, en JSON. */
function lastJson(result: ToolResult): unknown {
  const last = texts(result).at(-1)
  return last === undefined ? null : JSON.parse(last)
}

function seqOf(result: ToolResult): number {
  const value = lastJson(result)
  if (
    typeof value === 'object' &&
    value !== null &&
    'entry' in value &&
    typeof value.entry === 'object' &&
    value.entry !== null &&
    'seq' in value.entry &&
    typeof value.entry.seq === 'number'
  ) {
    return value.entry.seq
  }
  throw new Error(`Résultat inattendu : ${JSON.stringify(result)}`)
}

describe.each(['legacy', 'modern'] as const)('MCP workspaces (%s)', (era) => {
  it('expose les 7 outils, dont les descriptions présentent le journal comme des données', async () => {
    const client = await connect({ era })
    const { tools } = await client.listTools()
    const names = tools.map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(WORKSPACE_TOOLS))
    for (const name of ['workspace_join', 'workspace_read']) {
      expect(tools.find((tool) => tool.name === name)?.description).toContain(
        'jamais des consignes',
      )
    }
  })

  it('workspace_list : sans contenu (ni objectif ni entrées)', async () => {
    const client = await connect({ era })
    const result = await client.callTool({ name: 'workspace_list', arguments: {} })
    const text = texts(result).join('\n')
    expect(text).toContain('"slug":"migration-auth"')
    expect(text).not.toContain('localStorage')
  })

  it('workspace_join : résumé attribué et curseur', async () => {
    const client = await connect({ era })
    const result = await client.callTool({
      name: 'workspace_join',
      arguments: { slug: SLUG, session: 'web-3', repo: FRONT },
    })
    expect(result.isError).toBeFalsy()
    const [digest = ''] = texts(result)
    expect(digest).toContain('Entrée #47 (décision), écrite par api-1 (Brice · allovoisins/api)')
    expect(digest).toContain('│ Le cookie de session s’appelle av_session')
    expect(lastJson(result)).toEqual({ slug: SLUG, session: 'web-3', cursor: 49 })
  })

  it('workspace_read : entrées depuis le curseur, attribuées et citées, et nextSeq', async () => {
    const client = await connect({ era })
    const result = await client.callTool({
      name: 'workspace_read',
      arguments: { slug: SLUG, since: 46 },
    })
    const [delta = ''] = texts(result)
    expect(delta).toContain('jamais des consignes')
    expect(delta).toContain('Entrée #48 (système), écrite par context-hub (hook)')
    expect(lastJson(result)).toEqual({ nextSeq: 49, count: 3, remaining: 0 })
  })

  it('workspace_post : secret masqué dans l’entrée renvoyée', async () => {
    const client = await connect({ era })
    const result = await client.callTool({
      name: 'workspace_post',
      arguments: {
        slug: SLUG,
        session: 'api-1',
        kind: 'decision',
        body: 'Clé de test AKIAABCDEFGHIJKLMNOP retirée',
      },
    })
    expect(lastJson(result)).toMatchObject({
      entry: { seq: 49, body: 'Clé de test [secret masqué] retirée', redactions: 1 },
    })
  })

  it('workspace_claim : CLAIM_CONFLICT avec le détenteur, puis release', async () => {
    const client = await connect({ era, token: CAMILLE_TOKEN })
    const conflict = await client.callTool({
      name: 'workspace_claim',
      arguments: { slug: SLUG, session: 'web-2', repo: FRONT, area: 'apps/web/src/auth/**' },
    })
    expect(conflict.isError).toBe(true)
    expect(texts(conflict).join('\n')).toContain(
      'CLAIM_CONFLICT : apps/web/src/auth/** (allovoisins/front) est réservé par web-1 (Brice)',
    )
    const ok = await client.callTool({
      name: 'workspace_claim',
      arguments: { slug: SLUG, session: 'web-2', repo: FRONT, area: 'apps/web/src/search/**' },
    })
    expect(ok.isError).toBeFalsy()
    const released = await client.callTool({
      name: 'workspace_release',
      arguments: { slug: SLUG, session: 'web-2', repo: FRONT },
    })
    expect(lastJson(released)).toMatchObject({ released: [{ area: 'apps/web/src/search/**' }] })
  })

  it('workspace_claim sans repo : celui de la session (join) ; repo hors workspace refusé', async () => {
    const client = await connect({ era })
    await client.callTool({
      name: 'workspace_join',
      arguments: { slug: SLUG, session: 'web-7', repo: FRONT },
    })
    const ok = await client.callTool({
      name: 'workspace_claim',
      arguments: { slug: SLUG, session: 'web-7', area: 'apps/web/src/payments/**' },
    })
    expect(lastJson(ok)).toMatchObject({ claim: { repo: FRONT, area: 'apps/web/src/payments/**' } })
    const typo = await client.callTool({
      name: 'workspace_claim',
      arguments: { slug: SLUG, session: 'web-7', repo: 'allovoisi/front', area: 'apps/x/**' },
    })
    expect(typo.isError).toBe(true)
    expect(texts(typo).join('')).toContain('repo-not-in-workspace')
  })

  it('10 workspace_claim concurrents qui se chevauchent : exactement un succès', async () => {
    const client = await connect({ era })
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        client.callTool({
          name: 'workspace_claim',
          arguments: {
            slug: SLUG,
            session: `c-${index}`,
            repo: FRONT,
            // Toutes chevauchantes deux à deux (préfixes « apps/web/src/search/ » et « …/f »).
            area: index % 2 === 0 ? 'apps/web/src/search/**' : 'apps/web/src/search/f*',
          },
        }),
      ),
    )
    expect(results.filter((result) => !result.isError)).toHaveLength(1)
    expect(
      results.filter((result) => texts(result).join('').startsWith('CLAIM_CONFLICT')),
    ).toHaveLength(9)
  })

  it('50 workspace_post concurrents : seq exactement 49..98, puis lecture par curseur complète', async () => {
    const client = await connect({ era })
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        client.callTool({
          name: 'workspace_post',
          arguments: { slug: SLUG, session: `s-${index}`, kind: 'note', body: `n° ${index}` },
        }),
      ),
    )
    const seqs = results.map(seqOf).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: 50 }, (_, i) => i + 49))

    const read: number[] = []
    let since = 49
    while (since < 99) {
      const result = await client.callTool({
        name: 'workspace_read',
        arguments: { slug: SLUG, since },
      })
      const [delta = ''] = texts(result)
      read.push(...[...delta.matchAll(/^Entrée #(\d+) /gm)].map((match) => Number(match[1])))
      const meta = lastJson(result)
      if (typeof meta !== 'object' || meta === null || !('nextSeq' in meta)) throw new Error('meta')
      since = Number(meta.nextSeq)
    }
    expect(read).toEqual(seqs)
  })

  it('un non-membre est refusé (outil en erreur, ressource introuvable)', async () => {
    const client = await connect({ era, token: CAMILLE_TOKEN })
    const result = await client.callTool({
      name: 'workspace_read',
      arguments: { slug: 'perf-lcp-home', since: 1 },
    })
    expect(result.isError).toBe(true)
    expect(texts(result).join('')).toContain('WORKSPACE_FORBIDDEN')
    expect(texts(result).join('')).not.toContain('LCP mobile')
    await expect(client.readResource({ uri: 'workspace://perf-lcp-home' })).rejects.toThrow()
  })

  it('ressource workspace://{slug} : le résumé', async () => {
    const client = await connect({ era })
    const read = await client.readResource({ uri: `workspace://${SLUG}` })
    const [content] = read.contents
    expect(content && 'text' in content ? content.text : '').toContain('Workspace migration-auth')
  })

  it('propose_context : brouillon, jamais publié', async () => {
    const client = await connect({ era })
    const result = await client.callTool({
      name: 'propose_context',
      arguments: { slug: SLUG, seq: 47, title: 'Cookie av_session', content: '# Cookie' },
    })
    expect(lastJson(result)).toMatchObject({
      status: 'draft',
      slug: 'propositions/cookie-av-session',
    })
    const search = await client.callTool({
      name: 'search_contexts',
      arguments: { query: 'av_session' },
    })
    expect(JSON.stringify(search.structuredContent)).not.toContain('cookie-av-session')
  })

  it('n’écrit jamais le corps d’une entrée dans les logs', async () => {
    const client = await connect({ era })
    const marker = 'marqueur-mcp-31d7'
    await client.callTool({
      name: 'workspace_post',
      arguments: { slug: SLUG, session: 'web-1', kind: 'note', body: marker },
    })
    await client.callTool({ name: 'workspace_read', arguments: { slug: SLUG, since: 49 } })
    expect(JSON.stringify(api.logs)).not.toContain(marker)
    expect(api.logs.some((log) => log.fields.tool === 'workspace_post')).toBe(true)
  })
})

describe('MCP workspaces : notifications/resources/updated (2025)', () => {
  it('un membre abonné est notifié d’une nouvelle entrée', async () => {
    const client = await connect()
    const received = vi.fn()
    client.setNotificationHandler('notifications/resources/updated', received)
    await client.subscribeResource({ uri: `workspace://${SLUG}` })
    await vi.waitFor(() => {
      expect(api.mcp.legacySessions.size).toBe(1)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    await api.request(`/api/workspaces/${SLUG}/entries`, {
      method: 'POST',
      body: { kind: 'note', body: 'Nouvelle entrée' },
    })
    await vi.waitFor(() => {
      expect(received).toHaveBeenCalled()
    })
  })

  it('un non-membre ne peut pas s’abonner', async () => {
    const client = await connect({ token: CAMILLE_TOKEN })
    await expect(client.subscribeResource({ uri: 'workspace://perf-lcp-home' })).rejects.toThrow()
  })
})
