import type {
  NewCollection,
  TaxonomyRepository,
} from '../../application/ports/TaxonomyRepository.ts'
import { slugify } from '../../domain/context/slug.ts'
import type { Collection, Tag } from '../../domain/taxonomy/types.ts'
import type { InMemoryState } from './InMemoryStore.ts'
import { visibleState } from './InMemoryStore.ts'
import { toCollection } from './InMemoryWorkspaceRepository.ts'
import { simulateMutation, simulatePrimary, type SimulationOptions } from './simulation.ts'

export class InMemoryTaxonomyRepository implements TaxonomyRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
  ) {}

  listTags(): Promise<readonly Tag[]> {
    return simulatePrimary(this.simulation, () => {
      const { contexts, tags } = visibleState(this.state, this.simulation.mode())
      return tags.map(({ name, lastUsedAt }) => {
        const carriers = contexts.filter(({ context }) => context.tags.includes(name))
        return {
          name,
          lastUsedAt,
          contextCount: carriers.length,
          publishedCount: carriers.filter(({ context }) => context.status === 'published').length,
        }
      })
    })
  }

  listCollections(): Promise<readonly Collection[]> {
    return simulatePrimary(this.simulation, () => {
      const { contexts, collections } = visibleState(this.state, this.simulation.mode())
      return collections.map((record) =>
        toCollection(
          record,
          contexts.map((r) => r.context),
        ),
      )
    })
  }

  createCollection({ name, description }: NewCollection): Promise<Collection> {
    return simulateMutation(this.simulation, () => {
      const base = slugify(name) || 'collection'
      let id = base
      for (let n = 2; this.state.collections.some((c) => c.id === id); n += 1) id = `${base}-${n}`
      const record = { id, name: name.trim(), description: description.trim() }
      // Avant la collection système, qui reste en dernier.
      const systemIndex = this.state.collections.findIndex((c) => c.system)
      this.state.collections.splice(
        systemIndex < 0 ? this.state.collections.length : systemIndex,
        0,
        record,
      )
      return { ...record, contextCount: 0, publishedCount: 0 }
    })
  }
}
