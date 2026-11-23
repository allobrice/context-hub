import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'

export function useTags() {
  const { taxonomy } = useServices()
  return useQuery({ queryKey: queryKeys.tags, queryFn: () => taxonomy.listTags() })
}

export function useCollections() {
  const { taxonomy } = useServices()
  return useQuery({ queryKey: queryKeys.collections, queryFn: () => taxonomy.listCollections() })
}

/** Impact d'une fusion, recalculé côté serveur à chaque changement de sources ou de cible. */
export function useMergePreview(sources: readonly string[], target: string, enabled: boolean) {
  const { taxonomy } = useServices()
  return useQuery({
    queryKey: ['taxonomy', 'merge-preview', [...sources].sort(), target],
    queryFn: () => taxonomy.previewTagMerge(sources, target),
    enabled: enabled && target !== '' && sources.length > 0,
    staleTime: 0,
  })
}

/**
 * Une modification de taxonomie touche les contextes (tags, collection) : tout ce qui en dépend
 * est invalidé — listes, détails, navigation.
 */
function useTaxonomyMutation<A>(run: (args: A) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['taxonomy'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.contexts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ])
    },
  })
}

export function useTaxonomyActions() {
  const { taxonomy } = useServices()
  return {
    renameTag: useTaxonomyMutation(({ from, to }: { from: string; to: string }) =>
      taxonomy.renameTag(from, to),
    ),
    mergeTags: useTaxonomyMutation(
      ({ sources, target }: { sources: readonly string[]; target: string }) =>
        taxonomy.mergeTags(sources, target),
    ),
    deleteTags: useTaxonomyMutation((names: readonly string[]) => taxonomy.deleteTags(names)),
    createCollection: useTaxonomyMutation(taxonomy.createCollection.bind(taxonomy)),
    updateCollection: useTaxonomyMutation(
      ({ id, name, description }: { id: string; name: string; description: string }) =>
        taxonomy.updateCollection(id, { name, description }),
    ),
    deleteCollection: useTaxonomyMutation(taxonomy.deleteCollection.bind(taxonomy)),
  }
}
