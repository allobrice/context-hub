import { QueryClient } from '@tanstack/react-query'

/**
 * Pas de nouvel essai automatique : l'erreur s'affiche tout de suite avec un bouton « Réessayer »
 * (SPEC §5), plutôt qu'après plusieurs secondes de tentatives silencieuses.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}
