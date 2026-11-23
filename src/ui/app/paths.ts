import type { ContextId } from '../../domain/context/types.ts'

/** Chemins de l'application (SPEC §1), en un seul endroit. */
export const paths = {
  library: '/',
  taxonomy: '/taxonomy',
  mcp: '/mcp',
  newContext: (title?: string) =>
    title ? `/contexts/new?${new URLSearchParams({ title }).toString()}` : '/contexts/new',
  context: (id: ContextId) => `/contexts/${encodeURIComponent(id)}`,
  editContext: (id: ContextId) => `/contexts/${encodeURIComponent(id)}/edit`,
} as const
