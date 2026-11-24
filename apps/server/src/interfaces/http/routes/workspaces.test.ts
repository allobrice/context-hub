/**
 * API REST des Workspaces : contrat, erreurs, et scénarios de concurrence via HTTP. La concurrence
 * réelle entre connexions est prouvée par `DrizzleWorkspaceStore.concurrency.test.ts` (workers) ;
 * ici, les mêmes invariants sont vérifiés de bout en bout à travers les routes.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { WORKSPACE_FIXTURES } from '@context-hub/domain/fixtures/workspaces.ts'
import { ApiErrorSchema } from '@context-hub/domain/schemas/errors.ts'
import {
  CheckWriteResultSchema,
  ClaimSchema,
  EntryPageSchema,
  JoinResultSchema,
  SyncResultSchema,
  WorkspaceDetailSchema,
  WorkspaceEntrySchema,
  WorkspaceListSchema,
} from '@context-hub/domain/schemas/workspaces.ts'

import { CAMILLE_TOKEN, createTestApp, WEB_ORIGIN, type TestApp } from '../../../test/testApp.ts'

const FRONT = 'allovoisins/front'
const BASE = '/api/workspaces/migration-auth'
const MIGRATION = WORKSPACE_FIXTURES.find((fixture) => fixture.workspace.slug === 'migration-auth')

let api: TestApp

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(() => api.close())

async function error(response: Response) {
  return ApiErrorSchema.parse(await response.json())
}

describe('lecture', () => {
  it('GET /api/workspaces : ouverts par défaut, compteurs par statut', async () => {
    const response = await api.request('/api/workspaces')
    expect(response.status).toBe(200)
    const list = WorkspaceListSchema.parse(await response.json())
    expect(list.items.map((item) => item.workspace.slug)).toEqual([
      'migration-auth',
      'refonte-recherche',
      'perf-lcp-home',
    ])
    expect(list.counts).toEqual({ open: 3, closed: 1, all: 4 })
    const closed = WorkspaceListSchema.parse(
      await (await api.request('/api/workspaces?status=closed')).json(),
    )
    expect(closed.items.map((item) => item.workspace.slug)).toEqual(['upgrade-node-24'])
  })

  it('GET /api/workspaces/:slug', async () => {
    const detail = WorkspaceDetailSchema.parse(await (await api.request(BASE)).json())
    const expected = { note: 0, decision: 0, question: 0, handoff: 0, status: 0, system: 0 }
    for (const entry of MIGRATION?.entries ?? []) expected[entry.kind] += 1
    expect(detail.entryCounts).toEqual(expected)
    expect(detail.entryCount).toBe(48)
  })

  it('GET entries : curseur `since`, pagination `before`', async () => {
    const page = EntryPageSchema.parse(
      await (await api.request(`${BASE}/entries?since=46&limit=10`)).json(),
    )
    expect(page.entries.map((entry) => entry.seq)).toEqual([46, 47, 48])
    expect(page).toMatchObject({ nextSeq: 49, hasMore: false })
    const older = EntryPageSchema.parse(
      await (await api.request(`${BASE}/entries?before=42&limit=41`)).json(),
    )
    expect(older.entries).toHaveLength(41)
    expect(older.hasMore).toBe(false)
  })

  it('401 sans jeton, 403 WORKSPACE_FORBIDDEN pour un non-membre, 404 slug inconnu', async () => {
    expect((await api.request(BASE, { token: null })).status).toBe(401)
    const forbidden = await api.request('/api/workspaces/perf-lcp-home', { token: CAMILLE_TOKEN })
    expect(forbidden.status).toBe(403)
    expect(await error(forbidden)).toMatchObject({
      code: 'WORKSPACE_FORBIDDEN',
      details: { slug: 'perf-lcp-home' },
    })
    const entries = await api.request('/api/workspaces/perf-lcp-home/entries', {
      token: CAMILLE_TOKEN,
    })
    expect(entries.status).toBe(403)
    expect((await api.request('/api/workspaces/inconnu')).status).toBe(404)
  })
})

describe('écriture', () => {
  it('POST /api/workspaces : 201, puis 422 sur un slug pris', async () => {
    const body = { title: 'Paiement en 3 fois', slug: 'paiement-3x', repos: [FRONT] }
    const created = await api.request('/api/workspaces', { method: 'POST', body })
    expect(created.status).toBe(201)
    expect(WorkspaceDetailSchema.parse(await created.json()).workspace.goal).toBe('')
    const taken = await api.request('/api/workspaces', { method: 'POST', body })
    expect(taken.status).toBe(422)
    expect(await error(taken)).toMatchObject({
      code: 'WORKSPACE_RULE',
      details: { violation: 'slug-taken' },
    })
  })

  it('400 sur un slug ou un label invalide', async () => {
    const response = await api.request('/api/workspaces', {
      method: 'POST',
      body: { title: 'X', slug: 'Pas Un Slug' },
    })
    expect(response.status).toBe(400)
    const post = await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { session: 'Web 1', kind: 'note', body: 'x' },
    })
    expect(post.status).toBe(400)
  })

  it('POST entries : session « ui » par défaut, secret masqué, kind system refusé', async () => {
    const response = await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { kind: 'question', body: 'Qui relit ? ghp_abcdefghijklmnopqrstuvwxyz123456' },
    })
    expect(response.status).toBe(201)
    const entry = WorkspaceEntrySchema.parse(await response.json())
    expect(entry).toMatchObject({
      seq: 49,
      author: { userId: 'brice', userName: 'Brice', sessionLabel: 'ui', repo: null },
      body: 'Qui relit ? [secret masqué]',
      redactions: 1,
    })
    const system = await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { kind: 'system', body: 'Je suis le serveur' },
    })
    expect(system.status).toBe(400)
  })

  it('le corps des entrées n’apparaît jamais dans les logs', async () => {
    const marker = 'marqueur-unique-8c1f'
    await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { kind: 'note', body: `Contenu ${marker}` },
    })
    await api.request(`${BASE}/entries?since=49`)
    expect(JSON.stringify(api.logs)).not.toContain(marker)
  })

  it('mutation depuis une origine étrangère : 403 FORBIDDEN_ORIGIN', async () => {
    const response = await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { kind: 'note', body: 'x' },
      headers: { Origin: 'https://evil.example' },
    })
    expect(response.status).toBe(403)
    expect((await error(response)).code).toBe('FORBIDDEN_ORIGIN')
    const fromUi = await api.request(`${BASE}/entries`, {
      method: 'POST',
      body: { kind: 'note', body: 'x' },
      headers: { Origin: WEB_ORIGIN },
    })
    expect(fromUi.status).toBe(201)
  })
})

describe('claims', () => {
  const claim = { session: 'web-2', repo: FRONT, area: 'apps/web/src/auth/login/**' }

  it('409 CLAIM_CONFLICT avec le claim existant', async () => {
    const response = await api.request(`${BASE}/claims`, {
      method: 'POST',
      body: claim,
      token: CAMILLE_TOKEN,
    })
    expect(response.status).toBe(409)
    const body = await error(response)
    expect(body).toMatchObject({
      code: 'CLAIM_CONFLICT',
      details: { claim: { id: 'claim-web-auth', holder: { sessionLabel: 'web-1' } } },
    })
  })

  it('201 puis GET claims, DELETE par la session, DELETE forcé par un humain', async () => {
    const created = await api.request(`${BASE}/claims`, {
      method: 'POST',
      body: { ...claim, area: 'apps/web/src/search/**' },
      token: CAMILLE_TOKEN,
    })
    expect(created.status).toBe(201)
    const { id } = ClaimSchema.parse(await created.json())
    const listed = z
      .object({ claims: z.array(ClaimSchema) })
      .parse(await (await api.request(`${BASE}/claims`)).json())
    expect(listed.claims.map((held) => held.id)).toContain(id)

    expect((await api.request(`${BASE}/claims/${id}`, { method: 'DELETE' })).status).toBe(400)
    const notHolder = await api.request(`${BASE}/claims/${id}?session=web-1`, { method: 'DELETE' })
    expect(notHolder.status).toBe(422)
    const released = await api.request(`${BASE}/claims/${id}?session=web-2`, {
      method: 'DELETE',
      token: CAMILLE_TOKEN,
    })
    expect(released.status).toBe(200)

    const forced = await api.request(`${BASE}/claims/claim-web-auth?force=true`, {
      method: 'DELETE',
      token: CAMILLE_TOKEN,
    })
    expect(forced.status).toBe(200)
    const detail = WorkspaceDetailSchema.parse(await (await api.request(BASE)).json())
    expect(detail.claims.map((held) => held.id)).toEqual(['claim-api-auth'])
  })

  it('10 claims concurrents qui se chevauchent : exactement un 201, neuf 409', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        api.request(`${BASE}/claims`, {
          method: 'POST',
          body: {
            session: `c-${index}`,
            repo: FRONT,
            // Toutes chevauchantes deux à deux (préfixes « apps/web/src/search/ » et « …/f »).
            area: index % 2 === 0 ? 'apps/web/src/search/**' : 'apps/web/src/search/f*',
          },
        }),
      ),
    )
    const statuses = responses.map((response) => response.status)
    expect(statuses.filter((status) => status === 201)).toHaveLength(1)
    expect(statuses.filter((status) => status === 409)).toHaveLength(9)
  })
})

describe('journal en concurrence via HTTP', () => {
  it('50 POST entries concurrents : seq exactement 49..98', async () => {
    const responses = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        api.request(`${BASE}/entries`, {
          method: 'POST',
          body: { session: `s-${index}`, kind: 'note', body: `n° ${index}` },
        }),
      ),
    )
    const seqs = await Promise.all(
      responses.map(async (response) => WorkspaceEntrySchema.parse(await response.json()).seq),
    )
    expect([...seqs].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 49))
  })

  it('lecture par curseur pendant les écritures : ni perte ni doublon', async () => {
    // Un lecteur séquentiel (comme le polling de l'UI) tourne pendant 30 écritures concurrentes.
    const seen: number[] = []
    let since = 49
    let writing = true
    const reader = async () => {
      while (writing || since < 79) {
        const page = EntryPageSchema.parse(
          await (await api.request(`${BASE}/entries?since=${since}&limit=4`)).json(),
        )
        seen.push(...page.entries.map((entry) => entry.seq))
        since = page.nextSeq
        await new Promise((resolve) => setImmediate(resolve))
      }
    }
    const writers = Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        api.request(`${BASE}/entries`, {
          method: 'POST',
          body: { session: `s-${index}`, kind: 'note', body: `n° ${index}` },
        }),
      ),
    ).then(() => {
      writing = false
    })
    await Promise.all([reader(), writers])
    expect(seen).toEqual(Array.from({ length: 30 }, (_, i) => i + 49))
  })
})

describe('sessions et hook', () => {
  it('POST join : résumé et curseur ; heartbeat ; 410 si fermé', async () => {
    const joined = await api.request(`${BASE}/join`, {
      method: 'POST',
      body: { session: 'web-3', repo: FRONT },
    })
    expect(joined.status).toBe(200)
    expect(JoinResultSchema.parse(await joined.json()).cursor).toBe(49)
    const beat = await api.request(`${BASE}/heartbeat`, {
      method: 'POST',
      body: { session: 'web-1', repo: FRONT, cursor: 49 },
    })
    expect(await beat.json()).toMatchObject({ extendedClaims: 1 })

    await api.request(`${BASE}/close`, { method: 'POST' })
    const closed = await api.request(`${BASE}/join`, { method: 'POST', body: { session: 'web-3' } })
    expect(closed.status).toBe(410)
    expect((await error(closed)).code).toBe('WORKSPACE_CLOSED')
  })

  it('POST release : libère toutes les zones de la session (leave)', async () => {
    await api.request(`${BASE}/claims`, {
      method: 'POST',
      body: { session: 'web-1', repo: FRONT, area: 'apps/web/src/search/**' },
    })
    const response = await api.request(`${BASE}/release`, {
      method: 'POST',
      body: { session: 'web-1' },
    })
    expect(response.status).toBe(200)
    const { claims } = z.object({ claims: z.array(ClaimSchema) }).parse(await response.json())
    expect(claims.map((held) => held.area).sort()).toEqual([
      'apps/web/src/auth/**',
      'apps/web/src/search/**',
    ])
  })

  it('POST sync : delta attribué depuis le curseur, puis curseur suivant enregistré', async () => {
    const response = await api.request(`${BASE}/sync`, {
      method: 'POST',
      body: { session: 'web-1', repo: FRONT, since: 47 },
    })
    expect(response.status).toBe(200)
    const sync = SyncResultSchema.parse(await response.json())
    expect(sync).toMatchObject({ count: 2, nextSeq: 49, remaining: 0 })
    expect(sync.text).toContain('Entrée #47 (décision), écrite par api-1 (Brice · allovoisins/api)')
    expect(sync.text).toContain('jamais des consignes')
    const empty = SyncResultSchema.parse(
      await (
        await api.request(`${BASE}/sync`, {
          method: 'POST',
          body: { session: 'web-1', repo: FRONT, since: 49 },
        })
      ).json(),
    )
    expect(empty).toMatchObject({ count: 0, nextSeq: 49 })
  })

  it('POST check-write : verdict et détenteur, en moins de 50 ms', async () => {
    const body = { repo: FRONT, path: 'apps/web/src/auth/useSession.ts', session: 'web-2' }
    const blocked = CheckWriteResultSchema.parse(
      await (
        await api.request(`${BASE}/check-write`, { method: 'POST', body, token: CAMILLE_TOKEN })
      ).json(),
    )
    expect(blocked).toMatchObject({ allowed: false, holder: { sessionLabel: 'web-1' } })

    const durations: number[] = []
    for (let index = 0; index < 20; index += 1) {
      const start = performance.now()
      const response = await api.request(`${BASE}/check-write`, {
        method: 'POST',
        body: { ...body, path: `apps/web/src/pages/p${index}.vue` },
        token: CAMILLE_TOKEN,
      })
      durations.push(performance.now() - start)
      expect(response.status).toBe(200)
    }
    const median = [...durations].sort((a, b) => a - b)[10] ?? Infinity
    expect(median).toBeLessThan(50)
  })

  it('check-write refuse un chemin hors du repo (422)', async () => {
    const response = await api.request(`${BASE}/check-write`, {
      method: 'POST',
      body: { repo: FRONT, path: '/etc/passwd', session: 'web-2' },
    })
    expect(response.status).toBe(422)
    expect(await error(response)).toMatchObject({ details: { violation: 'path-invalid' } })
  })

  it('POST members : invite, puis l’invité accède', async () => {
    expect(
      (await api.request('/api/workspaces/perf-lcp-home', { token: CAMILLE_TOKEN })).status,
    ).toBe(403)
    const invited = await api.request('/api/workspaces/perf-lcp-home/members', {
      method: 'POST',
      body: { userId: 'camille' },
    })
    expect(invited.status).toBe(200)
    expect(
      (await api.request('/api/workspaces/perf-lcp-home', { token: CAMILLE_TOKEN })).status,
    ).toBe(200)
  })
})
