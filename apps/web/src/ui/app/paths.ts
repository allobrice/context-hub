import type { ContextId } from '@context-hub/domain/context/types.ts'

/** Chemins de l'application (SPEC §1), en un seul endroit. */
export const paths = {
  library: '/',
  taxonomy: '/taxonomy',
  mcp: '/mcp',
  newContext: (title?: string) =>
    title ? `/contexts/new?${new URLSearchParams({ title }).toString()}` : '/contexts/new',
  /** Éditeur prérempli depuis un workspace (« Proposer comme contexte ») : brouillon, jamais publié. */
  proposeContext: (prefill: { title: string; description: string; content: string }) =>
    `/contexts/new?${new URLSearchParams(prefill).toString()}`,
  workspaces: (status: 'open' | 'closed' | 'all' = 'open') =>
    status === 'open' ? '/workspaces' : `/workspaces?status=${status}`,
  workspace: (slug: string) => `/workspaces/${encodeURIComponent(slug)}`,
  /** File des missions ; filtres dans l'URL (`?filter=&tags=&repo=&batch=`). */
  missions: (search = '') => (search === '' ? '/missions' : `/missions?${search}`),
  mission: (slug: string) => `/missions/${encodeURIComponent(slug)}`,
  context: (id: ContextId) => `/contexts/${encodeURIComponent(id)}`,
  editContext: (id: ContextId) => `/contexts/${encodeURIComponent(id)}/edit`,
} as const
