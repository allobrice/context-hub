import type {
  ContextDetail,
  ContextRepository,
  LibrarySearchResult,
} from '../../application/ports/ContextRepository.ts'
import { canArchive, restoreAsDraft, unarchivedStatus } from '../../domain/context/lifecycle.ts'
import type { Context, ContextId } from '../../domain/context/types.ts'
import {
  countByStatus,
  filterContexts,
  paginate,
  sortContexts,
  type LibraryCriteria,
} from '../../domain/library/criteria.ts'
import { ContextNotFoundError } from '../../domain/shared/errors.ts'
import type { Clock } from '../../application/ports/Clock.ts'
import type { ContextRecord } from '../fixtures/contexts.ts'
import type { InMemoryState } from './InMemoryStore.ts'
import { visibleState } from './InMemoryStore.ts'
import { simulateMutation, simulatePrimary, type SimulationOptions } from './simulation.ts'

/** Identifiant de requête des 404 simulées (maquette 11). */
const NOT_FOUND_REQUEST_ID = '2c81d0'

/** Auteur des modifications faites depuis l'UI de démo. */
const CURRENT_USER = 'Brice'

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
