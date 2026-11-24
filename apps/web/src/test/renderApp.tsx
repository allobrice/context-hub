import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import type { AppConfig, AppServices } from '../application/services.ts'
import { createInMemoryServices } from '../infrastructure/createInMemoryServices.ts'
import type { MockMode } from '../infrastructure/in-memory/mockMode.ts'
import { AppProviders } from '../ui/app/providers/AppProviders.tsx'
import { createQueryClient } from '../ui/app/providers/createQueryClient.ts'
import { appRoutes } from '../ui/app/routes.tsx'

/** Services in-memory sans latence, dans le mode demandé. */
export function createTestServices(
  mode: MockMode = 'normal',
  config: AppConfig = { mcpUrl: null },
): AppServices {
  return createInMemoryServices({ mode: () => mode, latencyMs: 0, slowLatencyMs: 0 }, config)
}

export interface RenderAppOptions {
  mode?: MockMode
  services?: AppServices
}

/** Monte l'application complète (routes, providers, adapters in-memory sans latence) sur `url`. */
export function renderApp(url = '/', { mode = 'normal', services }: RenderAppOptions = {}) {
  const appServices =
    services ?? createInMemoryServices({ mode: () => mode, latencyMs: 0, slowLatencyMs: 0 })
  const router = createMemoryRouter(appRoutes, { initialEntries: [url] })
  const view = render(
    <AppProviders services={appServices} queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return { ...view, router, services: appServices, location: () => router.state.location }
}
