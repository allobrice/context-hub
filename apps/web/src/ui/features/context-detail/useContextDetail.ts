import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ContextDetail } from '../../../application/ports/ContextRepository.ts'
import type { ContextId } from '@context-hub/domain/context/types.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'

const detailKey = (reference: string) => [...queryKeys.contexts, 'detail', reference] as const

/** Un contexte par identifiant ou slug (paramètre de route). */
export function useContextDetail(reference: string) {
  const { contexts } = useServices()
  return useQuery({ queryKey: detailKey(reference), queryFn: () => contexts.get(reference) })
}

export type DetailAction =
  | { readonly kind: 'archive' }
  | { readonly kind: 'unarchive' }
  | { readonly kind: 'restore'; readonly versionNumber: number }

/**
 * Actions du Détail. Le cache du Détail est mis à jour avec la réponse, puis la Bibliothèque
 * et la navigation sont invalidées (compteurs, statuts).
 */
export function useDetailAction(reference: string, id: ContextId | undefined) {
  const { contexts } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (action: DetailAction): Promise<ContextDetail> => {
      if (!id) return Promise.reject(new Error('Contexte non chargé'))
      switch (action.kind) {
        case 'archive':
          return contexts.archive(id)
        case 'unarchive':
          return contexts.unarchive(id)
        case 'restore':
          return contexts.restoreVersion(id, action.versionNumber)
      }
    },
    onSuccess: async (detail) => {
      queryClient.setQueryData(detailKey(reference), detail)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.contexts, 'search'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ])
    },
  })
}
