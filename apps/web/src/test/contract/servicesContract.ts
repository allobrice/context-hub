/**
 * Suite de contrat UNIQUE des adapters de données : les mêmes scénarios tournent contre l'adapter
 * in-memory (`inMemory.contract.test.ts`) et contre l'adapter HTTP branché sur un vrai serveur
 * (`http.contract.test.ts`). Elle ne vérifie que le comportement observable par l'UI : ni les
 * identifiants générés ni les dates, qui diffèrent légitimement d'un adapter à l'autre.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ContextDraftInput } from '@context-hub/domain/context/editing.ts'
import { NUXT4_CONTEXT_ID } from '@context-hub/domain/fixtures/contexts.ts'
import { AUDIT_BATCH_ID, LCP_PROMPT } from '@context-hub/domain/fixtures/missions.ts'
import {
  MissionConflictError,
  MissionNotFoundError,
  MissionRuleError,
  MissionTransitionError,
} from '@context-hub/domain/missions/errors.ts'
import {
  ContextNotFoundError,
  DraftRejectedError,
  TaxonomyRuleError,
  VersionConflictError,
  WorkspaceClosedError,
  WorkspaceNotFoundError,
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
        const overview = await services.overview.getOverview()
        expect(overview).toMatchObject({
          workspaceName: 'Espace AlloVoisins',
          currentUser: { name: 'Brice' },
          contextCount: 42,
          scopeCounts: { personal: 5, project: 12, team: 25 },
          mcpServer: { status: 'online' },
          openWorkspaceCount: 3,
          missionTodoCount: 4,
        })
        expect(overview.tagNames).toHaveLength(34)
      })
    })

    describe('workspaces', () => {
      const SLUG = 'migration-auth'

      it('list : ouverts par défaut (maquette 23), compteurs par statut', async () => {
        const list = await services.workspaces.list('open')
        expect(list.counts).toEqual({ open: 3, closed: 1, all: 4 })
        expect(
          list.items.map((item) => [
            item.workspace.slug,
            item.activeSessions,
            item.sessionCount,
            item.claimCount,
            item.displayStatus,
          ]),
        ).toEqual([
          ['migration-auth', 3, 4, 2, 'open'],
          ['refonte-recherche', 1, 2, 1, 'open'],
          ['perf-lcp-home', 0, 1, 0, 'inactive'],
        ])
        const closed = await services.workspaces.list('closed')
        expect(closed.items.map((item) => item.workspace.slug)).toEqual(['upgrade-node-24'])
      })

      it('get : participants, claims actifs, contextes liés, compteurs (maquette 26)', async () => {
        const detail = await services.workspaces.get(SLUG)
        expect(detail.entryCount).toBe(48)
        expect(detail.createdByName).toBe('Brice')
        expect(detail.participants.map((p) => [p.session.sessionLabel, p.active])).toEqual([
          ['web-1', true],
          ['web-2', true],
          ['api-1', true],
          ['tests-1', false],
        ])
        expect(detail.claims.map((claim) => claim.area).sort()).toEqual([
          'apps/web/src/auth/**',
          'server/api/auth/**',
        ])
        expect(detail.linkedContexts.map((context) => [context.title, context.version])).toEqual([
          ['Conventions Nuxt 4 — composables & auto-imports', 4],
          ['Checklist accessibilité des composants', 2],
        ])
      })

      it('get : un slug inconnu lève WorkspaceNotFoundError', async () => {
        await expect(services.workspaces.get('inconnu')).rejects.toBeInstanceOf(
          WorkspaceNotFoundError,
        )
      })

      it('readEntries : par curseur et vers le passé', async () => {
        const latest = await services.workspaces.readEntries(SLUG, { before: 49, limit: 7 })
        expect(latest.entries.map((entry) => entry.seq)).toEqual([42, 43, 44, 45, 46, 47, 48])
        expect(latest.hasMore).toBe(true)
        const forward = await services.workspaces.readEntries(SLUG, { since: 47, limit: 10 })
        expect(forward).toMatchObject({ nextSeq: 49, hasMore: false })
        expect(forward.entries[0]).toMatchObject({
          seq: 47,
          kind: 'decision',
          author: { sessionLabel: 'api-1', userName: 'Brice', repo: 'allovoisins/api' },
        })
      })

      it('postEntry : publiée comme brice · ui, secret masqué par le serveur', async () => {
        const entry = await services.workspaces.postEntry(SLUG, {
          kind: 'note',
          body: 'Clé STRIPE=sk_live_51HxAbCdEfGh123',
        })
        expect(entry).toMatchObject({
          seq: 49,
          body: 'Clé STRIPE=[secret masqué]',
          redactions: 1,
          author: { userName: 'Brice', sessionLabel: 'ui' },
        })
        const page = await services.workspaces.readEntries(SLUG, { since: 49, limit: 5 })
        expect(page.entries.map((e) => e.seq)).toEqual([49])
      })

      it('forceReleaseClaim : le claim disparaît, une entrée système prévient le détenteur', async () => {
        const [claim] = (await services.workspaces.get(SLUG)).claims
        if (!claim) throw new Error('claim de fixture manquant')
        await services.workspaces.forceReleaseClaim(SLUG, claim.id)
        const detail = await services.workspaces.get(SLUG)
        expect(detail.claims.map((held) => held.id)).not.toContain(claim.id)
        const [entry] = (await services.workspaces.readEntries(SLUG, { since: 49, limit: 1 }))
          .entries
        expect(entry).toMatchObject({ kind: 'system', author: { system: 'claim' } })
        expect(entry?.body).toContain(`a libéré de force ${claim.area}`)
      })

      it('create puis close : lecture seule ensuite (WorkspaceClosedError)', async () => {
        const created = await services.workspaces.create({
          title: 'Contrat des adapters',
          slug: 'contrat-adapters',
          goal: 'Vérifier les deux adapters',
          repos: ['allovoisins/front'],
          linkedContextIds: [],
        })
        expect(created).toMatchObject({ displayStatus: 'open', entryCount: 1 })
        await expect(
          services.workspaces.create({ ...DRAFT_WORKSPACE, slug: 'contrat-adapters' }),
        ).rejects.toMatchObject({ violation: 'slug-taken' })
        const closed = await services.workspaces.close('contrat-adapters')
        expect(closed).toMatchObject({ displayStatus: 'closed', claims: [], closedByName: 'Brice' })
        await expect(
          services.workspaces.postEntry('contrat-adapters', { kind: 'note', body: 'x' }),
        ).rejects.toBeInstanceOf(WorkspaceClosedError)
      })
    })

    describe('missions', () => {
      const TODO_QUERY = { filter: 'todo', tags: [], repo: null, batchId: null } as const

      it('list : « À traiter » par défaut, tri priorité puis ancienneté, compteurs (maquette 31)', async () => {
        const list = await services.missions.list(TODO_QUERY)
        expect(list.counts).toEqual({ todo: 4, to_validate: 1, ready: 2, archived: 2, all: 6 })
        expect(list.items.map((item) => [item.priority, item.slug, item.status])).toEqual([
          ['P1', 'perf-lcp-carrousel', 'ready'],
          ['P1', 'perf-precharger-polices', 'in_progress'],
          ['P2', 'perf-decouper-chunk-vendor', 'ready'],
          ['P2', 'perf-hydratation-footer', 'draft'],
        ])
        expect(list.items.every((item) => !('prompt' in item))).toBe(true)
      })

      it('list : filtres tags (tous requis), archivées, lot', async () => {
        const fonts = await services.missions.list({ ...TODO_QUERY, tags: ['perf', 'fonts'] })
        expect(fonts.items.map((item) => item.slug)).toEqual(['perf-precharger-polices'])
        const archived = await services.missions.list({ ...TODO_QUERY, filter: 'archived' })
        expect(archived.items.map((item) => item.status).sort()).toEqual(['done', 'dropped'])
        const batch = await services.missions.list({ ...TODO_QUERY, batchId: AUDIT_BATCH_ID })
        expect(batch.counts.all).toBe(6)
      })

      it('batch : bloc « Origine » du lot', async () => {
        const batch = await services.missions.batch(AUDIT_BATCH_ID)
        expect(batch).toMatchObject({
          label: 'Audit perf · page d’accueil Nuxt',
          repo: 'allovoisins/front',
          commit: 'a41c9e2',
          total: 6,
          counts: { draft: 1, ready: 2, in_progress: 1, done: 1, dropped: 1, expired: 0 },
        })
        expect(batch.session?.sessionLabel).toBe('perf-1')
      })

      it('get : prompt, contexte lié publié, historique (maquette 35)', async () => {
        const detail = await services.missions.get('perf-lcp-carrousel')
        expect(detail.mission.prompt).toContain('## Critères d’acceptation')
        expect(detail.linkedContexts.map((context) => context.slug)).toEqual([NUXT4_SLUG])
        expect(detail.events.map((event) => event.type)).toEqual(['created', 'validated'])
        await expect(services.missions.get('inconnue')).rejects.toBeInstanceOf(MissionNotFoundError)
      })

      it('validate puis drop (raison obligatoire) puis reopen', async () => {
        const validated = await services.missions.validate('perf-hydratation-footer')
        expect(validated.mission).toMatchObject({ status: 'ready', validation: { by: 'brice' } })
        await expect(
          services.missions.drop('perf-hydratation-footer', '  '),
        ).rejects.toBeInstanceOf(MissionTransitionError)
        const dropped = await services.missions.drop('perf-hydratation-footer', 'Doublon')
        expect(dropped.mission).toMatchObject({ status: 'dropped', dropReason: 'Doublon' })
        const reopened = await services.missions.reopen('perf-hydratation-footer')
        expect(reopened.mission).toMatchObject({ status: 'ready', dropReason: null })
      })

      it('reject : la mission à valider disparaît ; une action sur un mauvais statut est refusée', async () => {
        await services.missions.reject('perf-hydratation-footer', 'Hors sujet')
        await expect(services.missions.get('perf-hydratation-footer')).rejects.toBeInstanceOf(
          MissionNotFoundError,
        )
        await expect(services.missions.validate('perf-lcp-carrousel')).rejects.toBeInstanceOf(
          MissionTransitionError,
        )
      })

      it('release : la mission en cours redevient prête', async () => {
        const released = await services.missions.release('perf-precharger-polices')
        expect(released.mission).toMatchObject({ status: 'ready', claim: null })
        expect(released.events.at(-1)).toMatchObject({ type: 'released', detail: 'forcée' })
      })

      it('update : garde de version (MissionConflictError) et relecture (MissionRuleError)', async () => {
        const { mission } = await services.missions.get('perf-lcp-carrousel')
        const command = {
          title: mission.title,
          summary: mission.summary,
          prompt: mission.prompt,
          priority: 'P2',
          tags: mission.tags,
          expectedUpdatedAt: mission.updatedAt,
        } as const
        const updated = await services.missions.update('perf-lcp-carrousel', command)
        expect(updated.mission.priority).toBe('P2')
        await expect(
          services.missions.update('perf-lcp-carrousel', command),
        ).rejects.toBeInstanceOf(MissionConflictError)
        await expect(
          services.missions.update('perf-lcp-carrousel', {
            ...command,
            prompt: '## Objectif\nRien.',
            expectedUpdatedAt: updated.mission.updatedAt,
          }),
        ).rejects.toBeInstanceOf(MissionRuleError)
      })

      it('create : prête directement (humain), refusée sans gabarit complet', async () => {
        const created = await services.missions.create({
          title: 'Mission du contrat',
          summary: 'Créée par la suite de contrat',
          prompt: LCP_PROMPT,
          priority: 'P3',
          tags: ['testing'],
          scope: { kind: 'team', team: 'allovoisins' },
          origin: { label: 'Contrat des adapters', batchId: null },
          codeRef: { repo: 'allovoisins/front', commit: 'a41c9e2', files: [] },
          linkedContextIds: [],
        })
        expect(created.mission).toMatchObject({ slug: 'mission-du-contrat', status: 'ready' })
        await expect(
          services.missions.create({
            title: 'Incomplète',
            summary: 'Sans gabarit',
            prompt: '## Objectif\nRien.',
            priority: 'P3',
            tags: [],
            scope: { kind: 'personal' },
            origin: { label: 'Contrat', batchId: null },
            codeRef: { repo: 'allovoisins/front', commit: 'a41c9e2', files: [] },
            linkedContextIds: [],
          }),
        ).rejects.toBeInstanceOf(MissionRuleError)
      })
    })
  })
}

const DRAFT_WORKSPACE = {
  title: 'Doublon',
  slug: 'doublon',
  goal: '',
  repos: [],
  linkedContextIds: [],
}
