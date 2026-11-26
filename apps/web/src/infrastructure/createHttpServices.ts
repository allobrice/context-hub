import { systemClock } from '../application/ports/Clock.ts'
import type { AppConfig, AppServices } from '../application/services.ts'
import { createApiClient, type ApiClientOptions } from './http/apiClient.ts'
import { HttpContextRepository } from './http/HttpContextRepository.ts'
import { HttpTaxonomyRepository } from './http/HttpTaxonomyRepository.ts'
import { HttpMissionRepository } from './http/HttpMissionRepository.ts'
import { HttpWorkspaceRepository } from './http/HttpWorkspaceRepository.ts'
import { HttpOverviewRepository } from './http/HttpOverviewRepository.ts'
import { LocalDraftStorage } from './storage/LocalDraftStorage.ts'

/**
 * Assemble les adapters HTTP sur l'API Context Hub. En dev, le navigateur n'envoie pas de jeton :
 * le proxy Vite l'ajoute côté Node (`CONTEXT_HUB_DEV_TOKEN`), il n'entre donc jamais dans le bundle.
 */
export function createHttpServices(api: ApiClientOptions, config: AppConfig): AppServices {
  const client = createApiClient(api)
  return {
    contexts: new HttpContextRepository(client),
    overview: new HttpOverviewRepository(client),
    workspaces: new HttpWorkspaceRepository(client),
    missions: new HttpMissionRepository(client),
    taxonomy: new HttpTaxonomyRepository(client),
    drafts: new LocalDraftStorage(),
    clock: systemClock,
    config,
  }
}
