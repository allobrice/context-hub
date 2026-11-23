import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { ApiErrorSchema } from '@context-hub/domain/schemas/errors.ts'

import { TEST_TOKEN } from '../../test/testDatabase.ts'
import { createTestApp, WEB_ORIGIN, type TestApp } from '../../test/testApp.ts'

const NUXT4 = CONTEXT_FIXTURES.find((r) => r.context.slug === 'nuxt/conventions-nuxt-4')?.context

let api: TestApp

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(() => {
  api.close()
})

describe('GET /api/health', () => {
  it('répond sans authentification', async () => {
    const response = await api.request('/api/health', { token: null })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /api/openapi.json', () => {
  it('sert le contrat OpenAPI 3.1 (authentifié), avec le format d’erreur unique', async () => {
    expect((await api.request('/api/openapi.json', { token: null })).status).toBe(401)
    const document: unknown = await (await api.request('/api/openapi.json')).json()
    expect(document).toMatchObject({
      openapi: '3.1.0',
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
        schemas: {
          Context: {},
          ContextDetail: {},
          DraftRejectedError: {},
          VersionConflictError: {},
        },
      },
      paths: {
        '/api/contexts': { get: {}, post: {} },
        '/api/contexts/{id}/publish': { post: { responses: { 409: {}, 422: {} } } },
        '/api/health': { get: { security: [] } },
      },
    })
  })
})

describe('CORS', () => {
  it('n’autorise que l’origine du front', async () => {
    const allowed = await api.request('/api/contexts', {
      method: 'OPTIONS',
      token: null,
      headers: {
        Origin: WEB_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    })
    expect(allowed.status).toBe(204)
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(WEB_ORIGIN)
    expect(allowed.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain(
      'authorization',
    )
    const other = await api.request('/api/contexts', {
      headers: { Origin: 'https://evil.example' },
    })
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

describe('journal', () => {
  it('trace chaque requête sans contenu, corps, query ni jeton', async () => {
    if (!NUXT4) throw new Error('fixture manquante')
    await api.request(`/api/contexts/${NUXT4.id}`)
    await api.request('/api/contexts?query=secret-recherche')
    await api.request(`/api/contexts/${NUXT4.id}/draft`, {
      method: 'PUT',
      body: { baseVersion: 5, draft: { content: 'CONTENU-PRIVE' } },
    })
    const serialized = JSON.stringify(api.logs)
    expect(api.logs.filter((log) => log.event === 'http.request')).toHaveLength(3)
    expect(api.logs[0]?.fields).toMatchObject({
      method: 'GET',
      route: '/api/contexts/:id',
      status: 200,
      user: 'brice',
    })
    for (const leaked of [
      NUXT4.publishedVersion?.content ?? '',
      'secret-recherche',
      'CONTENU-PRIVE',
      TEST_TOKEN,
    ]) {
      expect(leaked).not.toBe('')
      expect(serialized).not.toContain(leaked.slice(0, 40))
    }
  })
})

describe('erreurs', () => {
  it('refuse un JSON malformé au format unique (400)', async () => {
    const response = await api.request('/api/contexts', { method: 'POST', rawBody: '{"title": ' })
    expect(response.status).toBe(400)
    expect(ApiErrorSchema.parse(await response.json()).code).toBe('VALIDATION_FAILED')
  })

  it('répond 404 au format unique sur une route inconnue', async () => {
    const response = await api.request('/api/nulle-part')
    expect(response.status).toBe(404)
    expect(ApiErrorSchema.parse(await response.json())).toMatchObject({
      code: 'NOT_FOUND',
      details: { reference: '/api/nulle-part' },
    })
  })
})
