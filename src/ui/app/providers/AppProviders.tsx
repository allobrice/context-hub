import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import type { AppServices } from '../../../application/services.ts'
import { ThemeProvider } from '../theme/ThemeProvider.tsx'
import { ServicesContext } from './servicesContext.ts'

export interface AppProvidersProps {
  services: AppServices
  queryClient: QueryClient
  children: ReactNode
}

export function AppProviders({ services, queryClient, children }: AppProvidersProps) {
  return (
    <ServicesContext value={services}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </ServicesContext>
  )
}
