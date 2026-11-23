import { useQuery } from '@tanstack/react-query'

import { useServices } from './providers/servicesContext.ts'

/** Clés de cache TanStack Query, centralisées pour l'invalidation après mutation. */
export const queryKeys = {
  overview: ['workspace', 'overview'] as const,
  contexts: ['contexts'] as const,
}

/** Données de navigation (sidebar, options de filtres). */
export function useWorkspaceOverview() {
  const { workspace } = useServices()
  return useQuery({ queryKey: queryKeys.overview, queryFn: () => workspace.getOverview() })
}
