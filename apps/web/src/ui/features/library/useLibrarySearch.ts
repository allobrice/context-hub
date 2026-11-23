import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { LibraryCriteria } from '@context-hub/domain/library/criteria.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'

/** Résultats de la Bibliothèque ; les résultats précédents restent affichés pendant une nouvelle recherche. */
export function useLibrarySearch(criteria: LibraryCriteria) {
  const { contexts } = useServices()
  return useQuery({
    queryKey: [...queryKeys.contexts, 'search', criteria],
    queryFn: () => contexts.search(criteria),
    placeholderData: keepPreviousData,
  })
}
