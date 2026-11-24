import type { RouteObject } from 'react-router'

import { AppLayout } from './layout/AppLayout.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RouteErrorPage } from './pages/RouteErrorPage.tsx'

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
      {
        path: 'contexts/new',
        lazy: async () => ({
          Component: (await import('../features/context-editor/EditorPage.tsx')).EditorPage,
        }),
      },
      {
        path: 'contexts/:id',
        lazy: async () => ({
          Component: (await import('../features/context-detail/DetailPage.tsx')).DetailPage,
        }),
      },
      {
        path: 'contexts/:id/edit',
        lazy: async () => ({
          Component: (await import('../features/context-editor/EditorPage.tsx')).EditorPage,
        }),
      },
      {
        path: 'taxonomy',
        lazy: async () => ({
          Component: (await import('../features/taxonomy/TaxonomyPage.tsx')).TaxonomyPage,
        }),
      },
      {
        path: 'workspaces',
        lazy: async () => ({
          Component: (await import('../features/workspaces/WorkspacesPage.tsx')).WorkspacesPage,
        }),
      },
      {
        path: 'workspaces/:slug',
        lazy: async () => ({
          Component: (await import('../features/workspaces/WorkspaceDetailPage.tsx'))
            .WorkspaceDetailPage,
        }),
      },
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
