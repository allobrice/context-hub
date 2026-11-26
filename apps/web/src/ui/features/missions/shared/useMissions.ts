import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { MissionDetail } from '@context-hub/domain/missions/types.ts'

import type {
  CreateMissionCommand,
  MissionListQuery,
  UpdateMissionCommand,
} from '../../../../application/ports/MissionRepository.ts'
import { useServices } from '../../../app/providers/servicesContext.ts'
import { queryKeys } from '../../../app/queries.ts'

export const missionKeys = {
  all: ['missions'] as const,
  list: (query: MissionListQuery) => ['missions', 'list', query] as const,
  batch: (batchId: string) => ['missions', 'batch', batchId] as const,
  detail: (slug: string) => ['missions', 'detail', slug] as const,
}

/** Changer de filtre garde la file affichée (atténuée) jusqu'à la réponse : ni squelette ni décalage. */
export function useMissionList(query: MissionListQuery) {
  const { missions } = useServices()
  return useQuery({
    queryKey: missionKeys.list(query),
    queryFn: () => missions.list(query),
    placeholderData: keepPreviousData,
  })
}

/** Bloc « Origine » : seulement quand la file est filtrée sur un lot. */
export function useMissionBatch(batchId: string | null) {
  const { missions } = useServices()
  return useQuery({
    queryKey: missionKeys.batch(batchId ?? ''),
    queryFn: () => missions.batch(batchId ?? ''),
    enabled: batchId !== null,
  })
}

export function useMission(slug: string) {
  const { missions } = useServices()
  return useQuery({ queryKey: missionKeys.detail(slug), queryFn: () => missions.get(slug) })
}

/** Après une écriture : file, détails et compteur de la sidebar sont rechargés. */
function useInvalidateMissions() {
  const queryClient = useQueryClient()
  return (detail?: MissionDetail) => {
    if (detail !== undefined) {
      queryClient.setQueryData(missionKeys.detail(detail.mission.slug), detail)
    }
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: missionKeys.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
    ])
  }
}

export function useCreateMission() {
  const { missions } = useServices()
  const invalidate = useInvalidateMissions()
  return useMutation({
    mutationFn: (command: CreateMissionCommand) => missions.create(command),
    onSuccess: (detail) => invalidate(detail),
  })
}

export function useUpdateMission(slug: string) {
  const { missions } = useServices()
  const invalidate = useInvalidateMissions()
  return useMutation({
    mutationFn: (command: UpdateMissionCommand) => missions.update(slug, command),
    onSuccess: (detail) => invalidate(detail),
  })
}

/** Actions de l'en-tête du détail (SPEC §8.4), selon le statut. */
export type MissionAction =
  | { readonly kind: 'validate' }
  | { readonly kind: 'reject'; readonly reason: string | null }
  | { readonly kind: 'release' }
  | { readonly kind: 'drop'; readonly reason: string }
  | { readonly kind: 'reopen' }

export function useMissionAction(slug: string) {
  const { missions } = useServices()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateMissions()
  return useMutation({
    mutationFn: async (action: MissionAction): Promise<MissionDetail | null> => {
      switch (action.kind) {
        case 'validate':
          return missions.validate(slug)
        case 'reject':
          await missions.reject(slug, action.reason)
          return null
        case 'release':
          return missions.release(slug)
        case 'drop':
          return missions.drop(slug, action.reason)
        case 'reopen':
          return missions.reopen(slug)
      }
    },
    onSuccess: (detail) => {
      // Rejet : la mission n'existe plus, son détail n'est pas rechargé (il donnerait un 404).
      if (detail === null) queryClient.removeQueries({ queryKey: missionKeys.detail(slug) })
      return invalidate(detail ?? undefined)
    },
  })
}
