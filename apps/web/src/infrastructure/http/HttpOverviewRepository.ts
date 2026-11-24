import type {
  WorkspaceOverview,
  OverviewRepository,
} from '../../application/ports/OverviewRepository.ts'
import { unwrap, type ApiClient } from './apiClient.ts'
import { toCollection } from './mappers.ts'

export class HttpOverviewRepository implements OverviewRepository {
  constructor(private readonly api: ApiClient) {}

  async getOverview(): Promise<WorkspaceOverview> {
    const overview = await unwrap(this.api.GET('/api/workspace'))
    return { ...overview, collections: overview.collections.map(toCollection) }
  }
}
