import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  ContextDetail,
  SaveDraftCommand,
} from '../../../application/ports/ContextRepository.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'

export const tagsQueryKey = ['taxonomy', 'tags'] as const
export const collectionsQueryKey = ['taxonomy', 'collections'] as const

/** Tags avec compteurs, pour les suggestions de la combobox. */
export function useTagSuggestions() {
  const { taxonomy } = useServices()
  return useQuery({ queryKey: tagsQueryKey, queryFn: () => taxonomy.listTags() })
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
        queryClient.invalidateQueries({ queryKey: tagsQueryKey }),
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
        queryClient.invalidateQueries({ queryKey: collectionsQueryKey }),
      ])
    },
  })
}
