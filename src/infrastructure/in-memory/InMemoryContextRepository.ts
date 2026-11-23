import type {
  ContextDetail,
  ContextRepository,
  LibrarySearchResult,
  SaveDraftCommand,
} from '../../application/ports/ContextRepository.ts'
import {
  draftRejections,
  publishRejections,
  type ContextDraftInput,
} from '../../domain/context/editing.ts'
import {
  canArchive,
  nextDraftNumber,
  restoreAsDraft,
  unarchivedStatus,
} from '../../domain/context/lifecycle.ts'
import { slugify } from '../../domain/context/slug.ts'
import { estimateTokens } from '../../domain/context/tokens.ts'
import {
  toContextId,
  type Context,
  type ContextId,
  type ContextVersion,
} from '../../domain/context/types.ts'
import {
  countByStatus,
  filterContexts,
  paginate,
  sortContexts,
  type LibraryCriteria,
} from '../../domain/library/criteria.ts'
import {
  ContextNotFoundError,
  DraftRejectedError,
  VersionConflictError,
} from '../../domain/shared/errors.ts'
import type { Clock } from '../../application/ports/Clock.ts'
import type { ContextRecord } from '../fixtures/contexts.ts'
import type { InMemoryState } from './InMemoryStore.ts'
import { visibleState } from './InMemoryStore.ts'
import { simulateMutation, simulatePrimary, type SimulationOptions } from './simulation.ts'

/** Identifiant de requête des 404 simulées (maquette 11). */
const NOT_FOUND_REQUEST_ID = '2c81d0'

/** Auteur des modifications faites depuis l'UI de démo. */
const CURRENT_USER = 'Brice'

/** Collègue qui publie « pendant votre édition » en mode `?mock=conflict` (maquette 15). */
const CONCURRENT_AUTHOR = 'Camille'
const CONCURRENT_DELAY_MS = 2 * 60_000

export class InMemoryContextRepository implements ContextRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
    private readonly clock: Clock,
  ) {}

  search(criteria: LibraryCriteria): Promise<LibrarySearchResult> {
    return simulatePrimary(this.simulation, () => {
      const contexts = this.visibleRecords().map((record) => record.context)
      const matching = sortContexts(filterContexts(contexts, criteria), criteria.sort)
      return { page: paginate(matching, criteria.page), totals: countByStatus(contexts) }
    })
  }

  get(reference: string): Promise<ContextDetail> {
    return simulatePrimary(this.simulation, () => this.toDetail(this.find(reference)))
  }

  archive(id: ContextId): Promise<ContextDetail> {
    return this.update(id, (record) => {
      if (!canArchive(record.context)) return record
      return { ...record, context: this.touch({ ...record.context, status: 'archived' }) }
    })
  }

  unarchive(id: ContextId): Promise<ContextDetail> {
    return this.update(id, (record) => {
      if (canArchive(record.context)) return record
      return {
        ...record,
        context: this.touch({ ...record.context, status: unarchivedStatus(record.context) }),
      }
    })
  }

  restoreVersion(id: ContextId, versionNumber: number): Promise<ContextDetail> {
    return this.update(id, (record) => {
      const draft = restoreAsDraft({
        context: record.context,
        history: record.history,
        versionNumber,
        author: CURRENT_USER,
        at: this.clock.now().toISOString(),
      })
      if (!draft)
        throw new ContextNotFoundError(
          `${record.context.slug}@${versionNumber}`,
          NOT_FOUND_REQUEST_ID,
        )
      return { ...record, context: { ...record.context, draft } }
    })
  }

  saveDraft(command: SaveDraftCommand): Promise<ContextDetail> {
    return simulateMutation(this.simulation, () => this.store(command, { publish: false }))
  }

  publish(command: SaveDraftCommand): Promise<ContextDetail> {
    return simulateMutation(this.simulation, () => this.store(command, { publish: true }))
  }

  /** Contextes déjà « publiés par Camille » en mode conflit : une seule fois par contexte. */
  private readonly concurrentlyPublished = new Set<ContextId>()

  private store(command: SaveDraftCommand, { publish }: { publish: boolean }): ContextDetail {
    const index =
      command.id === null ? -1 : this.state.contexts.findIndex((r) => r.context.id === command.id)
    if (command.id !== null && index < 0)
      throw new ContextNotFoundError(command.id, NOT_FOUND_REQUEST_ID)
    const existing = index < 0 ? null : this.withSimulatedConcurrency(index)

    if (existing) this.assertNoConflict(existing, command.baseVersion)

    const check = {
      takenSlugs: new Set(
        this.state.contexts.filter((r) => r.context.id !== command.id).map((r) => r.context.slug),
      ),
      frozenSlug: existing?.context.publishedVersion ? existing.context.slug : null,
    }
    const reasons = publish
      ? publishRejections(command.draft, command.falsePositives, check)
      : draftRejections(command.draft, check)
    if (reasons.length > 0) throw new DraftRejectedError(reasons)

    const now = this.clock.now().toISOString()
    const record = this.applyDraft(existing, command.draft, now, publish)
    this.registerTags(command.draft.tags, now)
    if (index < 0) this.state.contexts.unshift(record)
    else this.state.contexts[index] = record
    return this.toDetail(record)
  }

  private assertNoConflict(record: ContextRecord, baseVersion: number | null): void {
    const published = record.context.publishedVersion
    if ((published?.number ?? null) === baseVersion) return
    throw new VersionConflictError(baseVersion ?? 0, published?.number ?? 0, published ?? undefined)
  }

  private applyDraft(
    existing: ContextRecord | null,
    input: ContextDraftInput,
    now: string,
    publish: boolean,
  ): ContextRecord {
    const version: ContextVersion = {
      number: existing ? nextDraftNumber(existing.context, existing.history) : 1,
      content: input.content,
      note: input.versionNote,
      author: CURRENT_USER,
      createdAt: now,
      tokenEstimate: estimateTokens(input.content),
    }
    const base: Context = existing?.context ?? {
      id: this.newId(input.slug),
      slug: input.slug,
      title: input.title,
      description: input.description,
      collectionId: input.collectionId,
      tags: input.tags,
      scope: input.scope,
      status: 'draft',
      publishedVersion: null,
      draft: null,
      createdAt: now,
      updatedAt: now,
      author: CURRENT_USER,
      mcpReads7d: 0,
    }
    const context: Context = {
      ...base,
      slug: input.slug,
      title: input.title,
      description: input.description,
      collectionId: input.collectionId,
      tags: input.tags,
      scope: input.scope,
      updatedAt: now,
      ...(publish
        ? { status: 'published', publishedVersion: version, draft: null }
        : { draft: version }),
    }
    const history = existing?.history ?? []
    return { context, history: publish ? [version, ...history] : history }
  }

  /**
   * Mode `?mock=conflict` : un collègue publie une nouvelle version juste avant l'enregistrement,
   * qui sera donc refusé (maquette 15). « Repartir de la vN » permet ensuite d'enregistrer.
   */
  private withSimulatedConcurrency(index: number): ContextRecord | null {
    const record = this.state.contexts[index]
    if (!record) return null
    const { context } = record
    const published = context.publishedVersion
    if (
      this.simulation.mode() !== 'conflict' ||
      !published ||
      this.concurrentlyPublished.has(context.id)
    ) {
      return record
    }
    this.concurrentlyPublished.add(context.id)
    const number = Math.max(published.number, ...record.history.map((v) => v.number)) + 1
    const content = `${published.content.trimEnd()}\n- Les middlewares nommés vivent dans \`app/middleware/\`.\n`
    const concurrent: ContextVersion = {
      number,
      content,
      note: 'Middlewares nommés',
      author: CONCURRENT_AUTHOR,
      createdAt: new Date(this.clock.now().getTime() - CONCURRENT_DELAY_MS).toISOString(),
      tokenEstimate: estimateTokens(content),
    }
    const next: ContextRecord = {
      context: {
        ...context,
        publishedVersion: concurrent,
        draft: context.draft ? { ...context.draft, number: number + 1 } : null,
      },
      history: [concurrent, ...record.history],
    }
    this.state.contexts[index] = next
    return next
  }

  private registerTags(tags: readonly string[], now: string): void {
    for (const name of tags) {
      const index = this.state.tags.findIndex((tag) => tag.name === name)
      if (index < 0) this.state.tags.push({ name, lastUsedAt: now })
      else this.state.tags[index] = { name, lastUsedAt: now }
    }
  }

  private newId(slug: string): ContextId {
    const base = `ctx-${slugify(slug) || 'contexte'}`
    let candidate = base
    for (let n = 2; this.state.contexts.some((r) => r.context.id === candidate); n += 1)
      candidate = `${base}-${n}`
    return toContextId(candidate)
  }

  private visibleRecords(): readonly ContextRecord[] {
    return visibleState(this.state, this.simulation.mode()).contexts
  }

  private find(reference: string): ContextRecord {
    const record = this.visibleRecords().find(
      ({ context }) => context.id === reference || context.slug === reference,
    )
    if (!record) throw new ContextNotFoundError(reference, NOT_FOUND_REQUEST_ID)
    return record
  }

  private toDetail({ context, history }: ContextRecord): ContextDetail {
    const collection = this.state.collections.find(
      (candidate) => candidate.id === context.collectionId,
    )
    return { context, history, collectionName: collection?.name ?? null }
  }

  private touch(context: Context): Context {
    return { ...context, updatedAt: this.clock.now().toISOString() }
  }

  private update(
    id: ContextId,
    change: (record: ContextRecord) => ContextRecord,
  ): Promise<ContextDetail> {
    return simulateMutation(this.simulation, () => {
      const index = this.state.contexts.findIndex((record) => record.context.id === id)
      const current = this.state.contexts[index]
      if (!current) throw new ContextNotFoundError(id, NOT_FOUND_REQUEST_ID)
      const next = change(current)
      this.state.contexts[index] = next
      return this.toDetail(next)
    })
  }
}
