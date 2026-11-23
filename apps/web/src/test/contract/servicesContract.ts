/**
 * Suite de contrat UNIQUE des adapters de données : les mêmes scénarios tournent contre l'adapter
 * in-memory (`inMemory.contract.test.ts`) et contre l'adapter HTTP branché sur un vrai serveur
 * (`http.contract.test.ts`). Elle ne vérifie que le comportement observable par l'UI : ni les
 * identifiants générés ni les dates, qui diffèrent légitimement d'un adapter à l'autre.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { NUXT4_CONTEXT_ID } from '@context-hub/domain/fixtures/contexts.ts'
import {
  ContextNotFoundError,
  DraftRejectedError,
  TaxonomyRuleError,
  VersionConflictError,
} from '@context-hub/domain/shared/errors.ts'
import {
  DEFAULT_LIBRARY_CRITERIA,
  type LibraryCriteria,
} from '@context-hub/domain/library/criteria.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import type { SaveDraftCommand } from '../../application/ports/ContextRepository.ts'
import type { AppServices } from '../../application/services.ts'

export interface ContractHarness {
  readonly services: AppServices
  readonly dispose: () => Promise<void>
}

const NUXT4_SLUG = 'nuxt/conventions-nuxt-4'

const DRAFT: ContextDraftInput = {
  title: 'Contrat des adapters',
  slug: 'tests/contrat-des-adapters',
  description: 'Créé par la suite de contrat',
  collectionId: null,
  tags: ['testing'],
  scope: { kind: 'team', team: 'allovoisins' },
  content: '# Contrat\n\nUn contenu propre.',
  versionNote: 'Version initiale',
}

function criteria(overrides: Partial<LibraryCriteria> = {}): LibraryCriteria {
  return { ...DEFAULT_LIBRARY_CRITERIA, ...overrides }
}

function command(overrides: Partial<SaveDraftCommand> = {}): SaveDraftCommand {
  return { id: null, baseVersion: null, draft: DRAFT, falsePositives: [], ...overrides }
}

export function describeServicesContract(
  name: string,
  createHarness: () => Promise<ContractHarness>,
  { timeout = 5_000 }: { timeout?: number } = {},
): void {
  describe(`contrat des adapters : ${name}`, { timeout }, () => {
    let harness: ContractHarness
    let services: AppServices

    beforeEach(async () => {
      harness = await createHarness()
      services = harness.services
    }, timeout)

    afterEach(() => harness.dispose())

    describe('contextes', () => {
      it('search : compteurs d’en-tête (42 · 31 · 8 · 3) et première page de 25', async () => {
        const { page, totals } = await services.contexts.search(criteria())
        expect(totals).toEqual({ total: 42, published: 31, draft: 8, archived: 3 })
        expect(page).toMatchObject({ page: 1, pageCount: 2, from: 1, to: 25 })
        expect(page.items).toHaveLength(25)
      })

      it('search : filtres de statut et de tag, recherche plein texte', async () => {
        const drafts = await services.contexts.search(criteria({ status: 'draft' }))
        expect(drafts.page.total).toBe(8)
        const nuxt = await services.contexts.search(criteria({ tags: ['nuxt'] }))
        expect(nuxt.page.items.every((c) => c.tags.includes('nuxt'))).toBe(true)
        const found = await services.contexts.search(criteria({ query: 'nuxt' }))
        expect(found.page.items.map((c) => c.slug)).toContain(NUXT4_SLUG)
      })

      it('get : par identifiant ou par slug, avec historique et collection', async () => {
        const byId = await services.contexts.get(NUXT4_CONTEXT_ID)
        const bySlug = await services.contexts.get(NUXT4_SLUG)
        expect(bySlug.context.id).toBe(byId.context.id)
        expect(byId.collectionName).toBe('Nuxt')
        expect(byId.context.publishedVersion?.number).toBe(4)
        expect(byId.context.draft?.number).toBe(5)
        const numbers = byId.history.map((version) => version.number)
        expect(numbers).toEqual([...numbers].sort((a, b) => b - a))
      })

      it('get : une référence inconnue lève ContextNotFoundError', async () => {
        await expect(services.contexts.get('inconnu/nulle-part')).rejects.toBeInstanceOf(
          ContextNotFoundError,
        )
      })

      it('saveDraft puis publish : nouveau contexte publié en v1', async () => {
        const saved = await services.contexts.saveDraft(command())
        expect(saved.context).toMatchObject({ slug: DRAFT.slug, status: 'draft', author: 'Brice' })
        expect(saved.context.draft?.number).toBe(1)
        const published = await services.contexts.publish(command({ id: saved.context.id }))
        expect(published.context).toMatchObject({ status: 'published', draft: null })
        expect(published.context.publishedVersion).toMatchObject({
          number: 1,
          note: 'Version initiale',
        })
        expect(published.history).toHaveLength(1)
      })

      it('publish : un secret dans le contenu est refusé (secret-detected)', async () => {
        const publish = services.contexts.publish(
          command({
            draft: { ...DRAFT, content: '# Config\n\nNUXT_API_KEY=sk_live_51HxDEMOonly3kQ' },
          }),
        )
        await expect(publish).rejects.toBeInstanceOf(DraftRejectedError)
        await expect(publish).rejects.toMatchObject({ reasons: ['secret-detected'] })
      })

      it('saveDraft : un slug déjà pris est refusé (slug-taken)', async () => {
        const save = services.contexts.saveDraft(command({ draft: { ...DRAFT, slug: NUXT4_SLUG } }))
        await expect(save).rejects.toMatchObject({ reasons: ['slug-taken'] })
      })

      it('saveDraft : une base périmée lève VersionConflictError avec la version publiée', async () => {
        const current = await services.contexts.get(NUXT4_CONTEXT_ID)
        const save = services.contexts.saveDraft(
          command({ id: NUXT4_CONTEXT_ID, baseVersion: 3, draft: { ...DRAFT, slug: NUXT4_SLUG } }),
        )
        await expect(save).rejects.toBeInstanceOf(VersionConflictError)
        await expect(save).rejects.toMatchObject({
          baseVersion: 3,
          latestVersion: 4,
          latest: { number: 4, content: current.context.publishedVersion?.content },
        })
      })

      it('archive puis unarchive', async () => {
        expect((await services.contexts.archive(NUXT4_CONTEXT_ID)).context.status).toBe('archived')
        expect((await services.contexts.unarchive(NUXT4_CONTEXT_ID)).context.status).toBe(
          'published',
        )
      })

      it('restoreVersion : copie la v1 dans le brouillon sans publier ; version inconnue refusée', async () => {
        const restored = await services.contexts.restoreVersion(NUXT4_CONTEXT_ID, 1)
        expect(restored.context.draft?.note).toBe('Restauration de la v1')
        expect(restored.context.publishedVersion?.number).toBe(4)
        await expect(services.contexts.restoreVersion(NUXT4_CONTEXT_ID, 99)).rejects.toBeInstanceOf(
          ContextNotFoundError,
        )
      })
    })

    describe('taxonomie', () => {
      it('listTags : les 34 tags ; previewTagMerge : impact de la maquette 17', async () => {
        expect(await services.taxonomy.listTags()).toHaveLength(34)
        expect(await services.taxonomy.previewTagMerge(['vue3', 'vuejs'], 'vue')).toEqual({
          affectedContexts: 7,
          affectedPublished: 5,
          duplicatesAvoided: 2,
        })
      })

      it('renameTag, mergeTags, deleteTags ; tag inconnu refusé', async () => {
        await services.taxonomy.renameTag('a11y', 'accessibilite')
        await services.taxonomy.mergeTags(['vue3', 'vuejs'], 'vue')
        await services.taxonomy.deleteTags(['docker', 'seo'])
        const names = (await services.taxonomy.listTags()).map((tag) => tag.name)
        expect(names).toContain('accessibilite')
        for (const gone of ['a11y', 'vue3', 'vuejs', 'docker', 'seo'])
          expect(names).not.toContain(gone)
        await expect(services.taxonomy.renameTag('inconnu', 'x')).rejects.toMatchObject({
          violation: 'unknown-tag',
        })
      })

      it('collections : création, renommage, suppression avec cible ; règles protégées', async () => {
        const created = await services.taxonomy.createCollection({ name: 'Tests', description: '' })
        expect(created).toMatchObject({ id: 'tests', name: 'Tests', contextCount: 0 })
        const renamed = await services.taxonomy.updateCollection('tests', {
          name: 'Tests bis',
          description: 'Renommée',
        })
        expect(renamed.name).toBe('Tests bis')
        await expect(
          services.taxonomy.updateCollection(UNCATEGORIZED_COLLECTION_ID, {
            name: 'X',
            description: '',
          }),
        ).rejects.toBeInstanceOf(TaxonomyRuleError)
        await expect(
          services.taxonomy.deleteCollection({
            deletedId: 'tests',
            targetId: null,
            addFormerNameAsTag: false,
          }),
        ).rejects.toMatchObject({ violation: 'deletion-target-required' })
        await services.taxonomy.deleteCollection({
          deletedId: 'tests',
          targetId: UNCATEGORIZED_COLLECTION_ID,
          addFormerNameAsTag: false,
        })
        const collections = await services.taxonomy.listCollections()
        expect(collections.some((c) => c.id === 'tests')).toBe(false)
        expect(collections.at(-1)).toMatchObject({ id: UNCATEGORIZED_COLLECTION_ID, system: true })
      })
    })

    describe('navigation', () => {
      it('getOverview : utilisateur, compteurs de portées et tags', async () => {
        const overview = await services.workspace.getOverview()
        expect(overview).toMatchObject({
          workspaceName: 'Espace AlloVoisins',
          currentUser: { name: 'Brice' },
          contextCount: 42,
          scopeCounts: { personal: 5, project: 12, team: 25 },
          mcpServer: { status: 'online' },
        })
        expect(overview.tagNames).toHaveLength(34)
      })
    })
  })
}
