import type { Context, ContextStatus, ScopeKind } from '../context/types.ts'
import { currentVersion } from '../context/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '../taxonomy/types.ts'

export const PAGE_SIZE = 25

export const LIBRARY_SORTS = ['updated-desc', 'updated-asc', 'title-asc', 'title-desc'] as const
export type LibrarySort = (typeof LIBRARY_SORTS)[number]

export interface LibraryFilters {
  readonly query: string
  /** Tous les tags demandés doivent être présents (ET). */
  readonly tags: readonly string[]
  /** null = toutes ; UNCATEGORIZED_COLLECTION_ID = « Sans collection ». */
  readonly collectionId: string | null
  readonly scope: ScopeKind | null
  readonly status: ContextStatus | null
}

export interface LibraryCriteria extends LibraryFilters {
  readonly sort: LibrarySort
  /** Numéro de page, à partir de 1. */
  readonly page: number
}

export const DEFAULT_LIBRARY_CRITERIA: LibraryCriteria = {
  query: '',
  tags: [],
  collectionId: null,
  scope: null,
  status: null,
  sort: 'updated-desc',
  page: 1,
}

export interface Page<T> {
  readonly items: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageCount: number
  /** Index (base 1) du premier et du dernier élément affichés, 0 si vide. */
  readonly from: number
  readonly to: number
}

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** Recherche plein texte : titre, description, tags et contenu (insensible à la casse et aux accents). */
export function matchesQuery(context: Context, query: string): boolean {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = fold(
    [
      context.title,
      context.description,
      context.slug,
      ...context.tags,
      currentVersion(context)?.content ?? '',
    ].join('\n'),
  )
  return terms.every((term) => haystack.includes(term))
}

/** Nombre de filtres actifs (hors recherche), pour « Retirer les filtres (n) ». */
export function activeFilterCount(filters: LibraryFilters): number {
  return (
    filters.tags.length +
    (filters.collectionId === null ? 0 : 1) +
    (filters.scope === null ? 0 : 1) +
    (filters.status === null ? 0 : 1)
  )
}

export function filterContexts(contexts: readonly Context[], filters: LibraryFilters): Context[] {
  return contexts.filter((context) => {
    if (filters.status !== null && context.status !== filters.status) return false
    if (filters.scope !== null && context.scope.kind !== filters.scope) return false
    if (filters.collectionId !== null) {
      const effective = context.collectionId ?? UNCATEGORIZED_COLLECTION_ID
      if (effective !== filters.collectionId) return false
    }
    if (!filters.tags.every((tag) => context.tags.includes(tag))) return false
    return matchesQuery(context, filters.query)
  })
}

const titleCollator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

export function sortContexts(contexts: readonly Context[], sort: LibrarySort): Context[] {
  const sorted = [...contexts]
  switch (sort) {
    case 'updated-desc':
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    case 'updated-asc':
      return sorted.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
    case 'title-asc':
      return sorted.sort((a, b) => titleCollator.compare(a.title, b.title))
    case 'title-desc':
      return sorted.sort((a, b) => titleCollator.compare(b.title, a.title))
  }
}

/** Découpe en pages ; une page hors bornes est ramenée à la dernière page valide. */
export function paginate<T>(
  items: readonly T[],
  page: number,
  pageSize: number = PAGE_SIZE,
): Page<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount)
  const start = (safePage - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)
  return {
    items: pageItems,
    total,
    page: safePage,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + pageItems.length,
  }
}

export type StatusCounts = Readonly<Record<ContextStatus, number>> & { readonly total: number }

/** Compteurs d'en-tête : « 42 contextes · 31 publiés · 8 brouillons · 3 archivés ». */
export function countByStatus(contexts: readonly Context[]): StatusCounts {
  const counts = { published: 0, draft: 0, archived: 0 }
  for (const { status } of contexts) counts[status] += 1
  return { ...counts, total: contexts.length }
}

/** Compte les éléments par clé (collections, portées… pour la sidebar). */
export function countBy<T, K extends string>(
  items: readonly T[],
  keyOf: (item: T) => K,
): ReadonlyMap<K, number> {
  const counts = new Map<K, number>()
  for (const item of items) {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}
