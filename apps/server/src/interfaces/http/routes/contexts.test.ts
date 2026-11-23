import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import { ContextDetailSchema } from '@context-hub/domain/schemas/context.ts'
import { ApiErrorSchema, type ApiError } from '@context-hub/domain/schemas/errors.ts'
import { LibrarySearchResultSchema } from '@context-hub/domain/schemas/library.ts'

import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../../test/testApp.ts'

const FIXTURES = CONTEXT_FIXTURES.map((record) => record.context)
const NUXT4_SLUG = 'nuxt/conventions-nuxt-4'
const NUXT4 = FIXTURES.find((context) => context.slug === NUXT4_SLUG)
const PERSONAL = FIXTURES.find((context) => context.scope.kind === 'personal')
const ARCHIVED = FIXTURES.find((context) => context.status === 'archived')
/** Publié sans brouillon : publier n'a rien à publier. */
const PUBLISHED_ONLY = FIXTURES.find((c) => c.status === 'published' && c.draft === null)

const SECRET = 'sk_live_51HxDEMOonly3kQ'

const NEW_DRAFT: ContextDraftInput = {
  title: 'Conventions de test',
  slug: 'tests/conventions-de-test',
  description: 'Créé par les tests HTTP',
  collectionId: null,
  tags: ['testing'],
  scope: { kind: 'team', team: 'allovoisins' },
  content: '# Conventions de test\n\nUn contenu propre.',
  versionNote: 'Version initiale',
}

let api: TestApp

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(() => {
  api.close()
})

async function detailOf(response: Response) {
  return ContextDetailSchema.parse(await response.json())
}

async function errorOf(response: Response): Promise<ApiError> {
  return ApiErrorSchema.parse(await response.json())
}

const encoded = (reference: string) => encodeURIComponent(reference)

describe('GET /api/contexts', () => {
  it('renvoie la première page et les compteurs (42 · 31 · 8 · 3)', async () => {
    const response = await api.request('/api/contexts')
    expect(response.status).toBe(200)
    const result = LibrarySearchResultSchema.parse(await response.json())
    expect(result.totals).toEqual({ total: 42, published: 31, draft: 8, archived: 3 })
    expect(result.page).toMatchObject({ page: 1, pageCount: 2, from: 1, to: 25 })
  })

  it('applique recherche, filtres (un ou plusieurs tags), tri et page', async () => {
    const one = LibrarySearchResultSchema.parse(
      await (await api.request('/api/contexts?tags=nuxt&status=published&sort=title-asc')).json(),
    )
    expect(one.page.items.every((c) => c.tags.includes('nuxt') && c.status === 'published')).toBe(
      true,
    )
    const two = LibrarySearchResultSchema.parse(
      await (await api.request('/api/contexts?tags=nuxt&tags=conventions&query=nuxt')).json(),
    )
    expect(two.page.items.map((c) => c.slug)).toContain(NUXT4_SLUG)
    const none = LibrarySearchResultSchema.parse(
      await (await api.request('/api/contexts?collection=none&page=2')).json(),
    )
    expect(none.page.page).toBe(1)
  })

  it('refuse un paramètre invalide (400)', async () => {
    const response = await api.request('/api/contexts?sort=hasard')
    expect(response.status).toBe(400)
    expect((await errorOf(response)).code).toBe('VALIDATION_FAILED')
  })

  it('exige un jeton valide (401)', async () => {
    expect((await api.request('/api/contexts', { token: null })).status).toBe(401)
    const response = await api.request('/api/contexts', { token: 'chub_inconnu' })
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain('Bearer')
    expect(await errorOf(response)).toMatchObject({ code: 'UNAUTHORIZED' })
  })
})

describe('GET /api/contexts/{id}', () => {
  it('trouve un contexte par identifiant ou par slug encodé', async () => {
    if (!NUXT4) throw new Error('fixture manquante')
    const byId = await detailOf(await api.request(`/api/contexts/${NUXT4.id}`))
    const bySlug = await detailOf(await api.request(`/api/contexts/${encoded(NUXT4_SLUG)}`))
    expect(byId.context.id).toBe(NUXT4.id)
    expect(bySlug.context.id).toBe(NUXT4.id)
    expect(bySlug.collectionName).toBe('Nuxt')
  })

  it('répond 404 pour une référence inconnue', async () => {
    const response = await api.request('/api/contexts/inconnu')
    expect(response.status).toBe(404)
    expect(await errorOf(response)).toMatchObject({
      code: 'NOT_FOUND',
      details: { reference: 'inconnu' },
    })
  })

  it('masque un contexte personnel aux autres utilisateurs (404, pas 403)', async () => {
    if (!PERSONAL) throw new Error('fixture manquante')
    expect((await api.request(`/api/contexts/${PERSONAL.id}`)).status).toBe(200)
    const other = await api.request(`/api/contexts/${PERSONAL.id}`, { token: CAMILLE_TOKEN })
    expect(other.status).toBe(404)
  })
})

describe('POST /api/contexts', () => {
  it('crée un brouillon v1 (201)', async () => {
    const response = await api.request('/api/contexts', { method: 'POST', body: NEW_DRAFT })
    expect(response.status).toBe(201)
    const { context } = await detailOf(response)
    expect(context).toMatchObject({ slug: NEW_DRAFT.slug, status: 'draft', author: 'Brice' })
    expect(context.draft?.number).toBe(1)
  })

  it('attribue une portée personnelle à son auteur, quel que soit le propriétaire envoyé', async () => {
    const response = await api.request('/api/contexts', {
      method: 'POST',
      body: { ...NEW_DRAFT, scope: { kind: 'personal', owner: 'camille' } },
    })
    expect((await detailOf(response)).context.scope).toEqual({ kind: 'personal', owner: 'brice' })
  })

  it('refuse un slug déjà pris ou invalide (422)', async () => {
    const taken = await api.request('/api/contexts', {
      method: 'POST',
      body: { ...NEW_DRAFT, slug: NUXT4_SLUG },
    })
    expect(taken.status).toBe(422)
    expect(await errorOf(taken)).toMatchObject({
      code: 'DRAFT_REJECTED',
      details: { reasons: ['slug-taken'] },
    })
    const invalid = await api.request('/api/contexts', {
      method: 'POST',
      body: { ...NEW_DRAFT, slug: 'Pas Un Slug' },
    })
    expect((await errorOf(invalid)).code).toBe('DRAFT_REJECTED')
  })

  it('refuse un corps mal formé (400)', async () => {
    const response = await api.request('/api/contexts', { method: 'POST', body: { title: 1 } })
    expect(response.status).toBe(400)
    const error = await errorOf(response)
    expect(error.code).toBe('VALIDATION_FAILED')
  })
})

describe('PUT /api/contexts/{id}/draft', () => {
  it('enregistre le brouillon au-dessus de la version publiée', async () => {
    if (!NUXT4?.publishedVersion) throw new Error('fixture manquante')
    const response = await api.request(`/api/contexts/${NUXT4.id}/draft`, {
      method: 'PUT',
      body: {
        baseVersion: NUXT4.publishedVersion.number,
        draft: { ...NEW_DRAFT, slug: NUXT4.slug, content: 'Nouveau brouillon' },
      },
    })
    expect(response.status).toBe(200)
    expect((await detailOf(response)).context.draft?.content).toBe('Nouveau brouillon')
  })

  it('répond 409 avec la version courante si une version a été publiée entre-temps', async () => {
    if (!NUXT4?.publishedVersion) throw new Error('fixture manquante')
    const latest = NUXT4.publishedVersion
    const response = await api.request(`/api/contexts/${NUXT4.id}/draft`, {
      method: 'PUT',
      body: { baseVersion: latest.number - 1, draft: { ...NEW_DRAFT, slug: NUXT4.slug } },
    })
    expect(response.status).toBe(409)
    expect(await errorOf(response)).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: {
        baseVersion: latest.number - 1,
        latestVersion: latest.number,
        latest: { number: latest.number, content: latest.content },
      },
    })
  })

  it('refuse de changer le slug après la v1 (422) et un contexte inconnu (404)', async () => {
    if (!NUXT4?.publishedVersion) throw new Error('fixture manquante')
    const frozen = await api.request(`/api/contexts/${NUXT4.id}/draft`, {
      method: 'PUT',
      body: { baseVersion: NUXT4.publishedVersion.number, draft: NEW_DRAFT },
    })
    expect(await errorOf(frozen)).toMatchObject({ details: { reasons: ['slug-frozen'] } })
    const unknown = await api.request('/api/contexts/inconnu/draft', {
      method: 'PUT',
      body: { baseVersion: null, draft: NEW_DRAFT },
    })
    expect(unknown.status).toBe(404)
  })
})

describe('POST /api/contexts/{id}/publish', () => {
  async function createDraft(content: string): Promise<string> {
    const response = await api.request('/api/contexts', {
      method: 'POST',
      body: { ...NEW_DRAFT, content },
    })
    return (await detailOf(response)).context.id
  }

  it('publie le brouillon en v1', async () => {
    const id = await createDraft('# Propre')
    const response = await api.request(`/api/contexts/${id}/publish`, {
      method: 'POST',
      body: { baseVersion: null, note: 'Version initiale' },
    })
    expect(response.status).toBe(200)
    const { context, history } = await detailOf(response)
    expect(context).toMatchObject({ status: 'published', draft: null })
    expect(context.publishedVersion).toMatchObject({ number: 1, note: 'Version initiale' })
    expect(history).toHaveLength(1)
  })

  it('rescanne le contenu : un secret donne 422 avec les findings, sans la valeur du secret', async () => {
    const id = await createDraft(`# Config\n\nNUXT_API_KEY=${SECRET}`)
    const response = await api.request(`/api/contexts/${id}/publish`, {
      method: 'POST',
      body: { baseVersion: null, note: 'Version initiale' },
    })
    expect(response.status).toBe(422)
    const raw = await response.text()
    expect(raw).not.toContain(SECRET)
    expect(ApiErrorSchema.parse(JSON.parse(raw))).toMatchObject({
      code: 'DRAFT_REJECTED',
      details: {
        reasons: ['secret-detected'],
        findings: [{ kind: 'secret', line: 3, pattern: 'sk_live_' }],
      },
    })
  })

  it('accepte un secret déclaré faux positif avec un motif', async () => {
    const id = await createDraft(`# Config\n\nNUXT_API_KEY=${SECRET}`)
    const response = await api.request(`/api/contexts/${id}/publish`, {
      method: 'POST',
      body: {
        baseVersion: null,
        note: 'Version initiale',
        falsePositives: [{ findingKey: 'secret:3:sk_live_', reason: 'Clé factice de démo' }],
      },
    })
    expect(response.status).toBe(200)
  })

  it('refuse un faux positif sans motif (400) et une note vide (422)', async () => {
    const id = await createDraft('# Propre')
    const noReason = await api.request(`/api/contexts/${id}/publish`, {
      method: 'POST',
      body: {
        baseVersion: null,
        note: 'v1',
        falsePositives: [{ findingKey: 'secret:3:sk_live_', reason: ' ' }],
      },
    })
    expect(noReason.status).toBe(400)
    const noNote = await api.request(`/api/contexts/${id}/publish`, {
      method: 'POST',
      body: { baseVersion: null, note: '  ' },
    })
    expect(await errorOf(noNote)).toMatchObject({ details: { reasons: ['version-note-empty'] } })
  })

  it('répond 409 sans brouillon à publier, ou si la base n’est plus la dernière version', async () => {
    if (!PUBLISHED_ONLY?.publishedVersion || !NUXT4?.publishedVersion)
      throw new Error('fixture manquante')
    const nothing = await api.request(`/api/contexts/${PUBLISHED_ONLY.id}/publish`, {
      method: 'POST',
      body: { baseVersion: PUBLISHED_ONLY.publishedVersion.number, note: 'v' },
    })
    expect(nothing.status).toBe(409)
    expect((await errorOf(nothing)).code).toBe('NO_DRAFT')
    const stale = await api.request(`/api/contexts/${NUXT4.id}/publish`, {
      method: 'POST',
      body: { baseVersion: 1, note: 'v' },
    })
    expect(stale.status).toBe(409)
    expect((await errorOf(stale)).code).toBe('VERSION_CONFLICT')
  })

  it('répond 404 pour un contexte inconnu', async () => {
    const response = await api.request('/api/contexts/inconnu/publish', {
      method: 'POST',
      body: { baseVersion: null, note: 'v' },
    })
    expect(response.status).toBe(404)
  })
})

describe('archivage et restauration', () => {
  it('archive puis désarchive (statut publié retrouvé)', async () => {
    if (!NUXT4) throw new Error('fixture manquante')
    const archived = await detailOf(
      await api.request(`/api/contexts/${NUXT4.id}/archive`, { method: 'POST' }),
    )
    expect(archived.context.status).toBe('archived')
    const restored = await detailOf(
      await api.request(`/api/contexts/${NUXT4.id}/unarchive`, { method: 'POST' }),
    )
    expect(restored.context.status).toBe('published')
  })

  it('désarchive un contexte archivé des fixtures, et 404 sur un inconnu', async () => {
    if (!ARCHIVED) throw new Error('fixture manquante')
    const response = await api.request(`/api/contexts/${ARCHIVED.id}/unarchive`, { method: 'POST' })
    expect((await detailOf(response)).context.status).not.toBe('archived')
    expect((await api.request('/api/contexts/inconnu/archive', { method: 'POST' })).status).toBe(
      404,
    )
  })

  it('restaure une version dans le brouillon, sans publier', async () => {
    if (!NUXT4?.publishedVersion) throw new Error('fixture manquante')
    const response = await api.request(`/api/contexts/${NUXT4.id}/versions/1/restore`, {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const { context } = await detailOf(response)
    expect(context.draft?.note).toBe('Restauration de la v1')
    expect(context.publishedVersion?.number).toBe(NUXT4.publishedVersion.number)
  })

  it('répond 404 pour une version inexistante', async () => {
    if (!NUXT4) throw new Error('fixture manquante')
    const response = await api.request(`/api/contexts/${NUXT4.id}/versions/99/restore`, {
      method: 'POST',
    })
    expect(response.status).toBe(404)
    expect(await errorOf(response)).toMatchObject({
      details: { reference: `${NUXT4_SLUG}@99` },
    })
  })
})
