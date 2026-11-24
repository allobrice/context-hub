import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type {
  CreateWorkspaceCommand,
  WorkspaceListFilter,
} from '../../../application/ports/WorkspaceRepository.ts'
import type { AuthoredEntryKind, WorkspaceDetail } from '@context-hub/domain/workspaces/types.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { queryKeys } from '../../app/queries.ts'
import {
  EMPTY_JOURNAL,
  JOURNAL_PAGE_SIZE,
  mergeEntries,
  nextSeqOf,
  oldestSeqOf,
  type JournalState,
} from './journal.ts'

/** Polling du journal (SPEC §7.4) : toutes les 3 s, uniquement si l'onglet est visible. */
export const DEFAULT_POLL_MS = 3_000
/** Participants et claims changent sans entrée (heartbeat) : rafraîchis plus rarement. */
const DETAIL_REFRESH_MS = 30_000
/** Borne haute de la première page (`before`) : les entrées les plus récentes. */
const LATEST = 2 ** 31 - 1
const TAIL_LIMIT = 100

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: (filter: WorkspaceListFilter) => ['workspaces', 'list', filter] as const,
  detail: (slug: string) => ['workspaces', 'detail', slug] as const,
  journal: (slug: string) => ['workspaces', 'journal', slug] as const,
  tail: (slug: string) => ['workspaces', 'tail', slug] as const,
}

export function useWorkspaceList(filter: WorkspaceListFilter) {
  const { workspaces } = useServices()
  return useQuery({
    queryKey: workspaceKeys.list(filter),
    queryFn: () => workspaces.list(filter),
  })
}

export function useWorkspace(slug: string) {
  const { workspaces } = useServices()
  return useQuery({
    queryKey: workspaceKeys.detail(slug),
    queryFn: () => workspaces.get(slug),
    refetchInterval: (query) =>
      query.state.data?.workspace.status === 'open' ? DETAIL_REFRESH_MS : false,
  })
}

/**
 * Journal d'un workspace : une première page (les entrées les plus récentes), jamais rechargée en
 * entier ; puis un polling `since=<prochain seq>` qui FUSIONNE les nouvelles entrées dans le cache.
 * Le polling s'arrête quand l'onglet est masqué (`refetchIntervalInBackground: false`) et pour un
 * workspace fermé.
 */
export function useJournal(slug: string, live: boolean) {
  const { workspaces, config } = useServices()
  const queryClient = useQueryClient()
  const journalKey = workspaceKeys.journal(slug)

  const journal = useQuery({
    queryKey: journalKey,
    queryFn: async (): Promise<JournalState> => {
      const page = await workspaces.readEntries(slug, { before: LATEST, limit: JOURNAL_PAGE_SIZE })
      return mergeEntries({ ...EMPTY_JOURNAL, hasOlder: page.hasMore }, page.entries)
    },
    staleTime: Infinity,
  })

  const tail = useQuery({
    queryKey: workspaceKeys.tail(slug),
    queryFn: async () => {
      const current = queryClient.getQueryData<JournalState>(journalKey) ?? EMPTY_JOURNAL
      const page = await workspaces.readEntries(slug, {
        since: nextSeqOf(current),
        limit: TAIL_LIMIT,
      })
      if (page.entries.length > 0) {
        queryClient.setQueryData<JournalState>(journalKey, (state) =>
          mergeEntries(state ?? EMPTY_JOURNAL, page.entries),
        )
        // Une nouvelle entrée peut venir d'un claim, d'une libération ou d'une fermeture.
        await queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(slug) })
      }
      return Date.now()
    },
    enabled: live && journal.isSuccess,
    refetchInterval: config.workspacePollMs ?? DEFAULT_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    // Chaque passage renouvelle `data` et `dataUpdatedAt`. Les lire ici re-rendait TOUTE la page à
    // chaque polling (mesuré : 13 rendus en 400 ms à 30 ms d'intervalle, contre 1). La page ne suit
    // que l'échec ; l'heure est lue par `useLastSync` dans l'indicateur, qui se re-rend seul.
    notifyOnChangeProps: ['isError'],
  })

  const loadOlder = useMutation({
    mutationFn: async () => {
      const current = queryClient.getQueryData<JournalState>(journalKey) ?? EMPTY_JOURNAL
      const oldest = oldestSeqOf(current)
      if (oldest === null) return
      const page = await workspaces.readEntries(slug, { before: oldest, limit: JOURNAL_PAGE_SIZE })
      queryClient.setQueryData<JournalState>(journalKey, (state) => ({
        ...mergeEntries(state ?? EMPTY_JOURNAL, page.entries),
        hasOlder: page.hasMore,
      }))
    },
  })

  return { journal, syncFailed: tail.isError, loadOlder }
}

/**
 * Horodatage (ms) de la dernière synchronisation réussie du journal, lu dans le cache sans
 * abonnement : à appeler depuis un composant qui se re-rend déjà de lui-même (indicateur « En direct »).
 */
export function useLastSync(slug: string): number {
  const queryClient = useQueryClient()
  // `dataUpdatedAt` vaut 0 tant que la requête n'a jamais abouti.
  const tail = queryClient.getQueryState(workspaceKeys.tail(slug))?.dataUpdatedAt ?? 0
  const journal = queryClient.getQueryState(workspaceKeys.journal(slug))?.dataUpdatedAt ?? 0
  return Math.max(tail, journal)
}

export function usePostEntry(slug: string) {
  const { workspaces } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entry: { kind: AuthoredEntryKind; body: string }) =>
      workspaces.postEntry(slug, entry),
    onSuccess: async (entry) => {
      queryClient.setQueryData<JournalState>(workspaceKeys.journal(slug), (state) =>
        mergeEntries(state ?? EMPTY_JOURNAL, [entry]),
      )
      await queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(slug) })
    },
  })
}

/** Après une écriture qui crée une entrée système côté serveur : détail et fin du journal. */
async function refreshAfterWrite(queryClient: ReturnType<typeof useQueryClient>, slug: string) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(slug) }),
    queryClient.invalidateQueries({ queryKey: workspaceKeys.tail(slug) }),
    queryClient.invalidateQueries({ queryKey: ['workspaces', 'list'] }),
  ])
}

export function useForceRelease(slug: string) {
  const { workspaces } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (claimId: string) => workspaces.forceReleaseClaim(slug, claimId),
    onSuccess: () => refreshAfterWrite(queryClient, slug),
  })
}

export function useCloseWorkspace(slug: string) {
  const { workspaces } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => workspaces.close(slug),
    onSuccess: async (detail: WorkspaceDetail) => {
      queryClient.setQueryData(workspaceKeys.detail(slug), detail)
      await Promise.all([
        refreshAfterWrite(queryClient, slug),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ])
    },
  })
}

export function useCreateWorkspace() {
  const { workspaces } = useServices()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (command: CreateWorkspaceCommand) => workspaces.create(command),
    onSuccess: async (detail) => {
      queryClient.setQueryData(workspaceKeys.detail(detail.workspace.slug), detail)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspaces', 'list'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.overview }),
      ])
    },
  })
}
