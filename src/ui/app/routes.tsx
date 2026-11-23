import type { RouteObject } from 'react-router'

import { AppLayout } from './layout/AppLayout.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RouteErrorPage } from './pages/RouteErrorPage.tsx'

/** Écran provisoire : sera remplacé par la feature de la phase indiquée. */
const comingSoon = (title: string) => async () => {
  const { ComingSoonPage } = await import('./pages/ComingSoonPage.tsx')
  return { Component: () => <ComingSoonPage title={title} /> }
}

/** Routes de l'application (SPEC §1). Chaque écran est chargé à la demande. */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    Component: AppLayout,
    ErrorBoundary: RouteErrorPage,
    // Affiché le temps de charger le module de la première route (lazy) ; rien plutôt qu'un flash.
    HydrateFallback: () => null,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import('../features/library/LibraryPage.tsx')).LibraryPage,
        }),
      },
      { path: 'contexts/new', lazy: comingSoon('Nouveau contexte') },
      {
        path: 'contexts/:id',
        lazy: async () => ({
          Component: (await import('../features/context-detail/DetailPage.tsx')).DetailPage,
        }),
      },
      { path: 'contexts/:id/edit', lazy: comingSoon('Modifier le contexte') },
      { path: 'taxonomy', lazy: comingSoon('Tags & collections') },
      {
        path: 'mcp',
        lazy: async () => ({ Component: (await import('../features/mcp/McpPage.tsx')).McpPage }),
      },
      ...(import.meta.env.DEV
        ? [
            {
              path: '__components',
              lazy: async () => ({
                Component: (await import('./dev/ComponentGallery.tsx')).ComponentGallery,
              }),
            },
          ]
        : []),
      { path: '*', Component: NotFoundPage },
    ],
  },
]
