import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  ContextDetail,
  SaveDraftCommand,
} from '../../../application/ports/ContextRepository.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'

/** Tags avec compteurs, pour les suggestions de la combobox. */
export function useTagSuggestions() {
  const { taxonomy } = useServices()
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => taxonomy.listTags() })
}

/** Enregistrer le brouillon ou publier : met à jour le cache du Détail et invalide les listes. */
export function useSaveContext() {
  const { contexts } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      command,
      publish,
    }: {
      command: SaveDraftCommand
      publish: boolean
    }): Promise<ContextDetail> =>
      publish ? contexts.publish(command) : contexts.saveDraft(command),
    onSuccess: async (detail) => {
      for (const reference of [detail.context.id, detail.context.slug]) {
        queryClient.setQueryData([...queryKeys.contexts, 'detail', reference], detail)
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...queryKeys.contexts, 'search'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tags }),
      ])
    },
  })
}

export function useCreateCollection() {
  const { taxonomy } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: taxonomy.createCollection.bind(taxonomy),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.collections }),
      ])
    },
  })
}
