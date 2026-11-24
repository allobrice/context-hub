import type { AppConfig, AppServices } from '../application/services.ts'
import { demoClock } from './fixtures/clock.ts'
import { InMemoryContextRepository } from './in-memory/InMemoryContextRepository.ts'
import { createDemoState } from './in-memory/InMemoryStore.ts'
import { InMemoryTaxonomyRepository } from './in-memory/InMemoryTaxonomyRepository.ts'
import { InMemoryOverviewRepository } from './in-memory/InMemoryOverviewRepository.ts'
import { InMemoryWorkspaceRepository } from './in-memory/InMemoryWorkspaceRepository.ts'
import { DEFAULT_SIMULATION, type SimulationOptions } from './in-memory/simulation.ts'
import { LocalDraftStorage } from './storage/LocalDraftStorage.ts'

/** Assemble les adapters in-memory sur un même état de démo. */
export function createInMemoryServices(
  simulation: Partial<SimulationOptions> = {},
  config: AppConfig = { mcpUrl: null },
): AppServices {
  const options = { ...DEFAULT_SIMULATION, ...simulation }
  const state = createDemoState()
  return {
    contexts: new InMemoryContextRepository(state, options, demoClock),
    overview: new InMemoryOverviewRepository(state, options),
    workspaces: new InMemoryWorkspaceRepository(state, options, demoClock),
    taxonomy: new InMemoryTaxonomyRepository(state, options, demoClock),
    drafts: new LocalDraftStorage(),
    clock: demoClock,
    config,
  }
}
