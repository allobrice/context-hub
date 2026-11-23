import {
  draftRejections,
  reviewPublication,
  type ContextDraftInput,
  type DraftCheck,
  type FalsePositive,
} from '@context-hub/domain/context/editing.ts'
import {
  canArchive,
  nextDraftNumber,
  restoreAsDraft,
  unarchivedStatus,
} from '@context-hub/domain/context/lifecycle.ts'
import { findingKey, scanContent } from '@context-hub/domain/context/scan.ts'
import { estimateTokens } from '@context-hub/domain/context/tokens.ts'
import type { Context, ContextId, ContextVersion } from '@context-hub/domain/context/types.ts'
import type { LibraryCriteria } from '@context-hub/domain/library/criteria.ts'
import {
  ContextNotFoundError,
  DraftRejectedError,
  TaxonomyRuleError,
  VersionConflictError,
} from '@context-hub/domain/shared/errors.ts'

import { NoDraftError } from '../errors.ts'
import type { Clock } from '../ports/Clock.ts'
import type { ContextEvents } from '../ports/ContextEvents.ts'
import type {
  ContextDetail,
  ContextMetadata,
  ContextSearchResult,
  ContextStore,
  RevisionWrite,
} from '../ports/ContextStore.ts'
import type { Viewer } from '../viewer.ts'

export interface SaveDraftCommand {
  /** Version publiée au début de l'édition (null si jamais publié) : sinon, conflit (409). */
  readonly baseVersion: number | null
  readonly draft: ContextDraftInput
}

export interface PublishCommand {
  readonly baseVersion: number | null
  readonly note: string
  /** Faux positifs déclarés dans l'éditeur, revalidés contre le scan refait ici. */
  readonly falsePositives: readonly FalsePositive[]
}

export interface ContextServiceDependencies {
  readonly store: ContextStore
  readonly clock: Clock
  readonly newId: () => ContextId
  /** Notifie les sessions MCP quand la liste des contextes publiés change. */
  readonly events: ContextEvents
}

/** Une portée personnelle appartient toujours à celui qui l'enregistre. */
function ownedBy(input: ContextDraftInput, viewer: Viewer): ContextDraftInput {
  if (input.scope.kind !== 'personal') return input
  return { ...input, scope: { kind: 'personal', owner: viewer.userId } }
}

function metadataOf(input: ContextDraftInput): ContextMetadata {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description,
    collectionId: input.collectionId,
    tags: input.tags,
    scope: input.scope,
  }
}

function revisionOf(number: number, content: string, note: string, viewer: Viewer): RevisionWrite {
  return { number, content, note, authorId: viewer.userId, tokenEstimate: estimateTokens(content) }
}

/** Le brouillon en cours, relu comme une saisie d'éditeur (pour rejouer les contrôles). */
function draftInputOf(context: Context, draft: ContextVersion, note: string): ContextDraftInput {
  return {
    title: context.title,
    slug: context.slug,
    description: context.description,
    collectionId: context.collectionId,
    tags: context.tags,
    scope: context.scope,
    content: draft.content,
    versionNote: note,
  }
}

function assertBaseVersion({ context }: ContextDetail, baseVersion: number | null): void {
  const published = context.publishedVersion
  if ((published?.number ?? null) === baseVersion) return
  throw new VersionConflictError(baseVersion ?? 0, published?.number ?? 0, published ?? undefined)
}

/**
 * Cas d'usage des contextes. Le serveur fait autorité : il rejoue les contrôles du domaine (slug,
 * portée, scan de contenu) quelle que soit la vérification déjà faite par l'UI. Les commandes
 * reçoivent une référence (identifiant ou slug) résolue dans la portée du `viewer`, puis écrivent
 * avec l'identifiant réel.
 */
export class ContextService {
  private readonly store: ContextStore
  private readonly clock: Clock
  private readonly newId: () => ContextId
  private readonly events: ContextEvents

  constructor({ store, clock, newId, events }: ContextServiceDependencies) {
    this.store = store
    this.clock = clock
    this.newId = newId
    this.events = events
  }

  search(viewer: Viewer, criteria: LibraryCriteria): Promise<ContextSearchResult> {
    return this.store.search(viewer, criteria)
  }

  /** @throws ContextNotFoundError si inconnu ou hors de portée (indistinguables : 404). */
  async get(viewer: Viewer, reference: string): Promise<ContextDetail> {
    const detail = await this.store.find(viewer, reference)
    if (!detail) throw new ContextNotFoundError(reference)
    return detail
  }

  /** Nouveau contexte, en brouillon v1. @throws DraftRejectedError */
  async create(viewer: Viewer, rawInput: ContextDraftInput): Promise<ContextDetail> {
    const input = ownedBy(rawInput, viewer)
    await this.assertCollectionExists(input.collectionId)
    const reasons = draftRejections(input, await this.draftCheck(input.slug, null, viewer))
    if (reasons.length > 0) throw new DraftRejectedError(reasons)
    const id = this.newId()
    await this.store.create({
      id,
      metadata: metadataOf(input),
      draft: revisionOf(1, input.content, input.versionNote, viewer),
      at: this.clock.now(),
    })
    return this.get(viewer, id)
  }

  /** @throws ContextNotFoundError, VersionConflictError, DraftRejectedError */
  async saveDraft(
    viewer: Viewer,
    reference: string,
    { baseVersion, draft }: SaveDraftCommand,
  ): Promise<ContextDetail> {
    const current = await this.get(viewer, reference)
    const id = current.context.id
    assertBaseVersion(current, baseVersion)
    const input = ownedBy(draft, viewer)
    await this.assertCollectionExists(input.collectionId)
    const reasons = draftRejections(input, await this.draftCheck(input.slug, current, viewer))
    if (reasons.length > 0) throw new DraftRejectedError(reasons)
    await this.store.saveDraft({
      id,
      expectedPublishedVersion: baseVersion,
      metadata: metadataOf(input),
      draft: revisionOf(
        nextDraftNumber(current.context, current.history),
        input.content,
        input.versionNote,
        viewer,
      ),
      at: this.clock.now(),
    })
    return this.get(viewer, id)
  }

  /**
   * Publie le brouillon en cours. Le contenu est rescanné ici : un secret restant (hors faux
   * positifs justifiés) refuse la publication avec les findings (422).
   * @throws ContextNotFoundError, NoDraftError, VersionConflictError, DraftRejectedError
   */
  async publish(
    viewer: Viewer,
    reference: string,
    { baseVersion, note, falsePositives }: PublishCommand,
  ): Promise<ContextDetail> {
    const current = await this.get(viewer, reference)
    const id = current.context.id
    const draft = current.context.draft
    if (!draft) throw new NoDraftError(id)
    assertBaseVersion(current, baseVersion)
    const input = draftInputOf(current.context, draft, note)
    const check = await this.draftCheck(input.slug, current, viewer)
    // Un seul scan du contenu, réutilisé pour la revue et pour filtrer les faux positifs.
    const scanned = scanContent(input.content)
    const { reasons, findings } = reviewPublication(input, falsePositives, check, scanned)
    if (reasons.length > 0) throw new DraftRejectedError(reasons, findings)
    // Ne conserver que les faux positifs qui portent sur un finding réel de ce contenu.
    const keys = new Set(scanned.map(findingKey))
    await this.store.publish({
      id,
      expectedPublishedVersion: baseVersion,
      metadata: metadataOf(input),
      version: revisionOf(draft.number, draft.content, note, viewer),
      falsePositives: falsePositives.filter((item) => keys.has(item.findingKey)),
      expectedDraftUpdatedAt: draft.createdAt,
      at: this.clock.now(),
    })
    this.events.emit({ kind: 'published', contextId: id })
    return this.get(viewer, id)
  }

  /** Les sessions MCP ne lisent plus le contexte. Sans effet s'il est déjà archivé. */
  async archive(viewer: Viewer, reference: string): Promise<ContextDetail> {
    const current = await this.get(viewer, reference)
    const { id } = current.context
    if (!canArchive(current.context)) return current
    await this.store.setStatus({ id, status: 'archived', at: this.clock.now() })
    this.events.emit({ kind: 'archived', contextId: id })
    return this.get(viewer, id)
  }

  async unarchive(viewer: Viewer, reference: string): Promise<ContextDetail> {
    const current = await this.get(viewer, reference)
    const { id } = current.context
    if (canArchive(current.context)) return current
    const status = unarchivedStatus(current.context)
    await this.store.setStatus({ id, status, at: this.clock.now() })
    this.events.emit({ kind: 'unarchived', contextId: id })
    return this.get(viewer, id)
  }

  /** Copie la version `versionNumber` dans le brouillon, sans publier. @throws ContextNotFoundError */
  async restoreVersion(
    viewer: Viewer,
    reference: string,
    versionNumber: number,
  ): Promise<ContextDetail> {
    const current = await this.get(viewer, reference)
    const { id } = current.context
    const restored = restoreAsDraft({
      context: current.context,
      history: current.history,
      versionNumber,
      author: viewer.userId,
      at: this.clock.now().toISOString(),
    })
    if (!restored) throw new ContextNotFoundError(`${current.context.slug}@${versionNumber}`)
    await this.store.restoreDraft({
      id,
      draft: revisionOf(restored.number, restored.content, restored.note, viewer),
      at: this.clock.now(),
    })
    return this.get(viewer, id)
  }

  /**
   * Contrôles d'un brouillon. La portée personnelle n'est permise que pour un nouveau contexte ou à
   * son auteur : sinon n'importe quel membre pourrait s'approprier un contexte d'équipe et le faire
   * disparaître pour les autres (audit phase 6).
   */
  private async draftCheck(
    slug: string,
    current: ContextDetail | null,
    viewer: Viewer,
  ): Promise<DraftCheck> {
    const id = current?.context.id ?? null
    const taken = await this.store.isSlugTaken(slug, id)
    return {
      takenSlugs: new Set(taken ? [slug] : []),
      frozenSlug: current?.context.publishedVersion ? current.context.slug : null,
      personalScopeAllowed: id === null || (await this.store.isAuthor(id, viewer.userId)),
    }
  }

  /** Une collection inconnue est une règle métier (422), pas une erreur de clé étrangère (500). */
  private async assertCollectionExists(collectionId: string | null): Promise<void> {
    if (collectionId !== null && !(await this.store.collectionExists(collectionId)))
      throw new TaxonomyRuleError('unknown-collection')
  }
}
