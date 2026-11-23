import type {
  ContextRepository,
  LibrarySearchResult,
} from '../../application/ports/ContextRepository.ts'
import {
  countByStatus,
  filterContexts,
  paginate,
  sortContexts,
  type LibraryCriteria,
} from '../../domain/library/criteria.ts'
import type { InMemoryState } from './InMemoryStore.ts'
import { visibleState } from './InMemoryStore.ts'
import { simulatePrimary, type SimulationOptions } from './simulation.ts'

export class InMemoryContextRepository implements ContextRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
  ) {}

  search(criteria: LibraryCriteria): Promise<LibrarySearchResult> {
    return simulatePrimary(this.simulation, () => {
      const contexts = visibleState(this.state, this.simulation.mode()).contexts.map(
        (record) => record.context,
      )
      const matching = sortContexts(filterContexts(contexts, criteria), criteria.sort)
      return { page: paginate(matching, criteria.page), totals: countByStatus(contexts) }
    })
  }
}
