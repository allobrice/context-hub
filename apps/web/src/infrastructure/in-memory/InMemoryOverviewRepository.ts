import { countStatuses, toFilterCounts } from '@context-hub/domain/missions/counts.ts'
import type {
  WorkspaceOverview,
  OverviewRepository,
} from '../../application/ports/OverviewRepository.ts'
import type { Context } from '@context-hub/domain/context/types.ts'
import { countBy } from '@context-hub/domain/library/criteria.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'
import type { CollectionRecord } from '@context-hub/domain/fixtures/collections.ts'
import { visibleState, type InMemoryState } from './InMemoryStore.ts'
import { simulateSecondary, type SimulationOptions } from './simulation.ts'

/** Compteurs d'une collection, calculés à partir des contextes. */
export function toCollection(record: CollectionRecord, contexts: readonly Context[]): Collection {
  const members = contexts.filter(
    (context) => (context.collectionId ?? UNCATEGORIZED_COLLECTION_ID) === record.id,
  )
  return {
    ...record,
    contextCount: members.length,
    publishedCount: members.filter((context) => context.status === 'published').length,
  }
}

export class InMemoryOverviewRepository implements OverviewRepository {
  constructor(
    private readonly state: InMemoryState,
    private readonly simulation: SimulationOptions,
  ) {}

  getOverview(): Promise<WorkspaceOverview> {
    return simulateSecondary(this.simulation, () => {
      const {
        contexts: records,
        collections,
        tags,
      } = visibleState(this.state, this.simulation.mode())
      const contexts = records.map((record) => record.context)
      const byScope = countBy(contexts, (context) => context.scope.kind)
      return {
        workspaceName: 'Espace AlloVoisins',
        currentUser: { name: 'Brice' },
        contextCount: contexts.length,
        collections: collections.map((record) => toCollection(record, contexts)),
        scopeCounts: {
          personal: byScope.get('personal') ?? 0,
          project: byScope.get('project') ?? 0,
          team: byScope.get('team') ?? 0,
        },
        tagNames: tags.map((tag) => tag.name).sort((a, b) => a.localeCompare(b, 'fr')),
        mcpServer: { status: 'online', transport: 'HTTP' },
        openWorkspaceCount:
          this.simulation.mode() === 'ws-empty'
            ? 0
            : visibleState(this.state, this.simulation.mode()).workspaces.filter(
                (record) => record.workspace.status === 'open',
              ).length,
        missionTodoCount:
          this.simulation.mode() === 'missions-empty'
            ? 0
            : toFilterCounts(
                countStatuses(
                  visibleState(this.state, this.simulation.mode()).missions.map(
                    ({ mission }) => mission,
                  ),
                ),
              ).todo,
      }
    })
  }
}
