import { createContext, useContext } from 'react'

import type { AppServices } from '../../../application/services.ts'

export const ServicesContext = createContext<AppServices | null>(null)

/** Ports applicatifs injectés par le point d'assemblage. L'UI ne connaît jamais l'infrastructure. */
export function useServices(): AppServices {
  const services = useContext(ServicesContext)
  if (!services) throw new Error('useServices doit être utilisé sous <AppProviders>')
  return services
}
