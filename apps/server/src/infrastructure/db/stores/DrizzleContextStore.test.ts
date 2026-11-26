import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { toContextId, type Context } from '@context-hub/domain/context/types.ts'
import { CONTEXT_FIXTURES } from '@context-hub/domain/fixtures/contexts.ts'
import {
  countBy,
  countByStatus,
  DEFAULT_LIBRARY_CRITERIA,
  type LibraryCriteria,
} from '@context-hub/domain/library/criteria.ts'
import { VersionConflictError } from '@context-hub/domain/shared/errors.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import type { ContextMetadata, RevisionWrite } from '../../../application/ports/ContextStore.ts'
import { toUserId } from '../../../application/viewer.ts'
import {
  BRICE,
  CAMILLE,
  createTestDatabase,
  type TestDatabase,
} from '../../../test/testDatabase.ts'

const FIXTURES = CONTEXT_FIXTURES.map((record) => record.context)
const NUXT4 = FIXTURES.find((context) => context.slug === 'nuxt/conventions-nuxt-4')
const PERSONAL = FIXTURES.filter((context) => context.scope.kind === 'personal')

function criteria(overrides: Partial<LibraryCriteria> = {}): LibraryCriteria {
  return { ...DEFAULT_LIBRARY_CRITERIA, ...overrides }
}

const AT = new Date('2026-11-23T10:30:00Z')

function revision(overrides: Partial<RevisionWrite> = {}): RevisionWrite {
  return {
    number: 1,
    content: '# Nouveau\n\nContenu spécifique zorglub.',
    note: 'Version initiale',
    authorId: toUserId('brice'),
    tokenEstimate: 9,
    ...overrides,
  }
}

const METADATA: ContextMetadata = {
  slug: 'tests/nouveau-contexte',
  title: 'Nouveau contexte',
  description: 'Créé par les tests',
  collectionId: null,
  tags: ['testing', 'tag-inedit'],
  exposeAsPrompt: false,
  scope: { kind: 'team', team: 'allovoisins' },
}

/** Message de l'erreur SQLite levée par `run` (Drizzle l'encapsule dans `cause`). */
function sqliteErrorMessage(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof Error && error.cause instanceof Error) return error.cause.message
    return String(error)
  }
  return ''
}

let database: TestDatabase

beforeEach(() => {
  database = createTestDatabase()
})

afterEach(() => {
  database.close()
})

describe('DrizzleContextStore : lecture', () => {
  it('reprend les compteurs d’en-tête des fixtures (42 · 31 · 8 · 3)', async () => {
    const { totals } = await database.contexts.search(BRICE, criteria())
    expect(totals).toEqual(countByStatus(FIXTURES))
  })

  it('reprend les compteurs de portées des fixtures', async () => {
    expect(await database.contexts.countByScope(BRICE)).toEqual(
      Object.fromEntries(countBy(FIXTURES, (context) => context.scope.kind)),
    )
  })

  it('masque les contextes personnels aux autres utilisateurs', async () => {
    const { totals } = await database.contexts.search(CAMILLE, criteria())
    expect(totals.total).toBe(FIXTURES.length - PERSONAL.length)
    const personal = PERSONAL[0]
    expect(personal).toBeDefined()
    if (!personal) return
    expect(await database.contexts.find(CAMILLE, personal.id)).toBeNull()
    expect(await database.contexts.find(BRICE, personal.id)).not.toBeNull()
  })

  it('pagine par 25 et trie par mise à jour décroissante (les 8 contextes des maquettes en tête)', async () => {
    const first = await database.contexts.search(BRICE, criteria())
    expect(first.page).toMatchObject({ total: 42, page: 1, pageCount: 2, from: 1, to: 25 })
    expect(first.page.items.slice(0, 8).map((c) => c.slug)).toEqual(
      FIXTURES.slice(0, 8).map((c) => c.slug),
    )
    const second = await database.contexts.search(BRICE, criteria({ page: 9 }))
    expect(second.page).toMatchObject({ page: 2, from: 26, to: 42 })
    expect(second.page.items).toHaveLength(17)
  })

  it('trie par titre sans casse ni accents', async () => {
    const { page } = await database.contexts.search(BRICE, criteria({ sort: 'title-asc' }))
    const titles = page.items.map((c) => c.title.normalize('NFD').replace(/\p{Diacritic}/gu, ''))
    expect(titles).toEqual(
      [...titles].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en')),
    )
  })

  it('filtre par statut, portée, collection (dont « Sans collection ») et tags (ET)', async () => {
    const expect_ = async (overrides: Partial<LibraryCriteria>, expected: readonly Context[]) => {
      const { page } = await database.contexts.search(BRICE, criteria(overrides))
      expect(page.total).toBe(expected.length)
    }
    await expect_(
      { status: 'draft' },
      FIXTURES.filter((c) => c.status === 'draft'),
    )
    await expect_(
      { scope: 'project' },
      FIXTURES.filter((c) => c.scope.kind === 'project'),
    )
    await expect_(
      { collectionId: 'nuxt' },
      FIXTURES.filter((c) => c.collectionId === 'nuxt'),
    )
    await expect_(
      { collectionId: UNCATEGORIZED_COLLECTION_ID },
      FIXTURES.filter((c) => c.collectionId === null),
    )
    await expect_(
      { tags: ['nuxt', 'conventions'] },
      FIXTURES.filter((c) => c.tags.includes('nuxt') && c.tags.includes('conventions')),
    )
  })

  it('cherche en plein texte, sans accents, en préfixe, dans le contenu', async () => {
    const { page } = await database.contexts.search(BRICE, criteria({ query: 'NUXT' }))
    expect(page.items.map((c) => c.slug)).toContain('nuxt/conventions-nuxt-4')
    const prefix = await database.contexts.search(BRICE, criteria({ query: 'useasyncd' }))
    expect(prefix.page.items.map((c) => c.slug)).toContain('nuxt/conventions-nuxt-4')
    const none = await database.contexts.search(
      BRICE,
      criteria({ query: 'pinia ssr', scope: 'team' }),
    )
    expect(none.page.total).toBe(0)
  })

  it('trouve un contexte par identifiant ou par slug, avec historique, collection et lectures', async () => {
    expect(NUXT4).toBeDefined()
    if (!NUXT4) return
    const byId = await database.contexts.find(BRICE, NUXT4.id)
    const bySlug = await database.contexts.find(BRICE, NUXT4.slug)
    expect(byId?.context.id).toBe(NUXT4.id)
    expect(bySlug?.context.id).toBe(NUXT4.id)
    expect(byId?.collectionName).toBe('Nuxt')
    expect(byId?.context.mcpReads7d).toBe(NUXT4.mcpReads7d)
    expect(byId?.context.tags).toEqual(NUXT4.tags)
    expect(byId?.context.publishedVersion?.number).toBe(NUXT4.publishedVersion?.number)
    expect(byId?.context.draft?.number).toBe(NUXT4.draft?.number)
    const numbers = byId?.history.map((version) => version.number) ?? []
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a))
    expect(await database.contexts.find(BRICE, 'inconnu/nulle-part')).toBeNull()
  })

  it('repère les slugs déjà pris, sauf par le contexte lui-même', async () => {
    if (!NUXT4) return
    expect(await database.contexts.isSlugTaken(NUXT4.slug, null)).toBe(true)
    expect(await database.contexts.isSlugTaken(NUXT4.slug, NUXT4.id)).toBe(false)
    expect(await database.contexts.isSlugTaken('libre/slug', null)).toBe(false)
  })
})

describe('DrizzleContextStore : écriture', () => {
  const ID = toContextId('ctx-test-nouveau')

  it('crée un brouillon, indexé pour la Bibliothèque', async () => {
    await database.contexts.create({ id: ID, metadata: METADATA, draft: revision(), at: AT })
    const detail = await database.contexts.find(BRICE, ID)
    expect(detail?.context).toMatchObject({
      status: 'draft',
      publishedVersion: null,
      author: 'Brice',
      tags: ['testing', 'tag-inedit'],
      updatedAt: AT.toISOString(),
    })
    expect(detail?.context.draft?.number).toBe(1)
    const found = await database.contexts.search(BRICE, criteria({ query: 'zorglub' }))
    expect(found.page.items.map((c) => c.id)).toEqual([ID])
    const tags = await database.taxonomy.listTags(BRICE)
    expect(tags.find((tag) => tag.name === 'tag-inedit')?.lastUsedAt).toBe(AT.toISOString())
  })

  it('publie : nouvelle version immuable, brouillon supprimé, contenu publié indexé', async () => {
    await database.contexts.create({ id: ID, metadata: METADATA, draft: revision(), at: AT })
    await database.contexts.publish({
      id: ID,
      expectedPublishedVersion: null,
      metadata: METADATA,
      version: revision(),
      falsePositives: [{ findingKey: 'secret:1:sk-', reason: 'exemple de documentation' }],
      expectedDraftUpdatedAt: AT.toISOString(),
      at: AT,
    })
    const detail = await database.contexts.find(BRICE, ID)
    expect(detail?.context.status).toBe('published')
    expect(detail?.context.publishedVersion?.number).toBe(1)
    expect(detail?.context.draft).toBeNull()
    expect(detail?.history).toHaveLength(1)
    expect(database.searchIndex.match(database.db, 'zorglub', 'published')).toEqual([ID])
  })

  it('refuse de publier un brouillon modifié entre sa relecture et la publication', async () => {
    await database.contexts.create({ id: ID, metadata: METADATA, draft: revision(), at: AT })
    const publish = database.contexts.publish({
      id: ID,
      expectedPublishedVersion: null,
      metadata: METADATA,
      version: revision(),
      falsePositives: [],
      expectedDraftUpdatedAt: '2026-01-01T00:00:00.000Z',
      at: AT,
    })
    await expect(publish).rejects.toBeInstanceOf(VersionConflictError)
    expect((await database.contexts.find(BRICE, ID))?.context.status).toBe('draft')
  })

  it('refuse aussi le DELETE d’une version publiée', () => {
    expect(sqliteErrorMessage(() => database.db.run(sql`DELETE FROM context_versions`))).toMatch(
      /immuable/,
    )
  })

  it('refuse l’UPDATE d’une version publiée (trigger d’immuabilité)', () => {
    expect(
      sqliteErrorMessage(() =>
        database.db.run(sql`UPDATE context_versions SET content = 'falsifié'`),
      ),
    ).toMatch(/immuable/)
  })

  it('refuse un brouillon basé sur une version qui n’est plus la dernière (409)', async () => {
    if (!NUXT4?.publishedVersion) return
    const stale = NUXT4.publishedVersion.number - 1
    const save = database.contexts.saveDraft({
      id: NUXT4.id,
      expectedPublishedVersion: stale,
      metadata: { ...METADATA, slug: NUXT4.slug },
      draft: revision({ number: 9 }),
      at: AT,
    })
    await expect(save).rejects.toBeInstanceOf(VersionConflictError)
    await expect(save).rejects.toMatchObject({
      baseVersion: stale,
      latestVersion: NUXT4.publishedVersion.number,
      latest: { number: NUXT4.publishedVersion.number, author: NUXT4.publishedVersion.author },
    })
  })

  it('enregistre un brouillon au-dessus de la version publiée attendue', async () => {
    if (!NUXT4?.publishedVersion) return
    await database.contexts.saveDraft({
      id: NUXT4.id,
      expectedPublishedVersion: NUXT4.publishedVersion.number,
      metadata: { ...METADATA, slug: NUXT4.slug, title: 'Titre revu' },
      draft: revision({ number: 6, content: 'brouillon secret-terme-unique' }),
      at: AT,
    })
    const detail = await database.contexts.find(BRICE, NUXT4.id)
    expect(detail?.context.title).toBe('Titre revu')
    expect(detail?.context.draft?.content).toContain('secret-terme-unique')
    // Le brouillon est cherchable dans la Bibliothèque, jamais dans la recherche publiée (MCP).
    expect(database.searchIndex.match(database.db, 'secret-terme-unique', 'library')).toEqual([
      NUXT4.id,
    ])
    expect(database.searchIndex.match(database.db, 'secret-terme-unique', 'published')).toEqual([])
  })

  it('restaure une version dans le brouillon et change le statut', async () => {
    if (!NUXT4) return
    await database.contexts.restoreDraft({
      id: NUXT4.id,
      draft: revision({ number: 7, note: 'Restauration de la v1' }),
      at: AT,
    })
    await database.contexts.setStatus({ id: NUXT4.id, status: 'archived', at: AT })
    const detail = await database.contexts.find(BRICE, NUXT4.id)
    expect(detail?.context.draft).toMatchObject({ number: 7, note: 'Restauration de la v1' })
    expect(detail?.context.status).toBe('archived')
  })

  it('compte les lectures MCP des 7 derniers jours', async () => {
    if (!NUXT4?.publishedVersion) return
    await database.mcpReads.record({
      contextId: NUXT4.id,
      version: NUXT4.publishedVersion.number,
      userId: toUserId('camille'),
      at: database.clock.now(),
    })
    await database.mcpReads.record({
      contextId: NUXT4.id,
      version: 1,
      userId: toUserId('camille'),
      at: new Date('2026-11-01T00:00:00Z'),
    })
    const detail = await database.contexts.find(BRICE, NUXT4.id)
    expect(detail?.context.mcpReads7d).toBe(NUXT4.mcpReads7d + 1)
  })
})
