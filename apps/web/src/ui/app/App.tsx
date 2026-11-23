import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

import type { AppServices } from '../../application/services.ts'
import { AppProviders } from './providers/AppProviders.tsx'
import { appRoutes } from './routes.tsx'

export interface AppProps {
  services: AppServices
  queryClient: QueryClient
}

export function App({ services, queryClient }: AppProps) {
  const [router] = useState(() => createBrowserRouter(appRoutes))
  return (
    <AppProviders services={services} queryClient={queryClient}>
      <RouterProvider router={router} />
    </AppProviders>
  )
}
