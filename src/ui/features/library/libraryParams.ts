import type { ContextStatus, ScopeKind } from '../../../domain/context/types.ts'
import { CONTEXT_STATUSES, SCOPE_KINDS } from '../../../domain/context/types.ts'
import {
  DEFAULT_LIBRARY_CRITERIA,
  LIBRARY_SORTS,
  type LibraryCriteria,
  type LibrarySort,
} from '../../../domain/library/criteria.ts'

/**
 * État de la Bibliothèque sérialisé dans l'URL (SPEC §5.1) : filtres, tri, recherche, page et vue.
 * Les paramètres inconnus (ex. `mock`) sont conservés.
 */
export type LibraryView = 'table' | 'cards'

export interface LibraryUrlState extends LibraryCriteria {
  readonly view: LibraryView
}

export const DEFAULT_LIBRARY_STATE: LibraryUrlState = { ...DEFAULT_LIBRARY_CRITERIA, view: 'table' }

const KEYS = {
  query: 'q',
  tags: 'tags',
  collectionId: 'collection',
  scope: 'scope',
  status: 'status',
  sort: 'sort',
  page: 'page',
  view: 'view',
} as const satisfies Record<keyof LibraryUrlState, string>

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | null {
  return allowed.find((candidate) => candidate === value) ?? null
}

function nonEmpty(value: string | null): string | null {
  return value === null || value === '' ? null : value
}

export function parseLibraryParams(params: URLSearchParams): LibraryUrlState {
  const page = Number.parseInt(params.get(KEYS.page) ?? '', 10)
  return {
    query: params.get(KEYS.query) ?? '',
    tags: (params.get(KEYS.tags) ?? '').split(',').filter(Boolean),
    collectionId: nonEmpty(params.get(KEYS.collectionId)),
    scope: oneOf<ScopeKind>(SCOPE_KINDS, params.get(KEYS.scope)),
    status: oneOf<ContextStatus>(CONTEXT_STATUSES, params.get(KEYS.status)),
    sort: oneOf<LibrarySort>(LIBRARY_SORTS, params.get(KEYS.sort)) ?? DEFAULT_LIBRARY_STATE.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    view: params.get(KEYS.view) === 'cards' ? 'cards' : 'table',
  }
}

function serialize(state: LibraryUrlState, key: keyof LibraryUrlState): string | null {
  switch (key) {
    case 'query':
      return state.query.trim() || null
    case 'tags':
      return state.tags.length > 0 ? state.tags.join(',') : null
    case 'page':
      return state.page > 1 ? String(state.page) : null
    case 'sort':
      return state.sort === DEFAULT_LIBRARY_STATE.sort ? null : state.sort
    case 'view':
      return state.view === DEFAULT_LIBRARY_STATE.view ? null : state.view
    case 'collectionId':
    case 'scope':
    case 'status':
      return state[key]
  }
}

/** Écrit l'état dans `base` (copie) : valeurs par défaut omises, paramètres étrangers conservés. */
export function writeLibraryParams(
  state: LibraryUrlState,
  base = new URLSearchParams(),
): URLSearchParams {
  const params = new URLSearchParams(base)
  for (const key of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
    const value = serialize(state, key)
    if (value === null) params.delete(KEYS[key])
    else params.set(KEYS[key], value)
  }
  return params
}

/** Applique un changement ; tout changement autre que la page revient en page 1. */
export function patchLibraryState(
  state: LibraryUrlState,
  patch: Partial<LibraryUrlState>,
): LibraryUrlState {
  const resetsPage = Object.keys(patch).some((key) => key !== 'page' && key !== 'view')
  return { ...state, ...(resetsPage ? { page: 1 } : {}), ...patch }
}

/** Lien vers la Bibliothèque avec quelques filtres (sidebar, état vide…). */
export function libraryHref(patch: Partial<LibraryUrlState>): string {
  const search = writeLibraryParams({ ...DEFAULT_LIBRARY_STATE, ...patch }).toString()
  return search ? `/?${search}` : '/'
}
