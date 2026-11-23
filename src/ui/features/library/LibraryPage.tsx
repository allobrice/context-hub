import { useDeferredValue, useMemo } from 'react'

import { isRepositoryUnavailable } from '../../../application/errors.ts'
import type { StatusCounts } from '../../../domain/library/criteria.ts'
import { paths } from '../../app/paths.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { useWorkspaceOverview } from '../../app/queries.ts'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { ErrorState } from '../../components/ErrorState/ErrorState.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import { ContextCards } from './ContextCards.tsx'
import { ContextTable } from './ContextTable.tsx'
import { FilterBar } from './FilterBar.tsx'
import { LibrarySkeleton } from './LibrarySkeleton.tsx'
import { LibraryEmpty, NoResults } from './LibraryStates.tsx'
import styles from './LibraryPage.module.scss'
import type { LibraryUrlState } from './libraryParams.ts'
import { Pagination } from './Pagination.tsx'
import { SearchField } from './SearchField.tsx'
import { useLibrarySearch } from './useLibrarySearch.ts'
import { useLibraryUrlState } from './useLibraryUrlState.ts'

function totalsLabel(totals: StatusCounts): string {
  if (totals.total === 0) return 'Aucun contexte'
  return [
    plural(totals.total, 'contexte', 'contextes'),
    plural(totals.published, 'publié', 'publiés'),
    plural(totals.draft, 'brouillon', 'brouillons'),
    plural(totals.archived, 'archivé', 'archivés'),
  ].join(' · ')
}

/** Noms des filtres actifs, dans l'ordre de la barre. */
function activeFilterNames(state: LibraryUrlState): string[] {
  return [
    state.tags.length > 0 && 'Tags',
    state.collectionId !== null && 'Collection',
    state.scope !== null && 'Portée',
    state.status !== null && 'Statut',
  ].filter((name): name is string => name !== false)
}

/** Bibliothèque (SPEC §5.1, maquettes 01–07). L'URL est la source de vérité de la recherche et des filtres. */
export function LibraryPage() {
  const [state, update] = useLibraryUrlState()
  const { clock } = useServices()
  const overview = useWorkspaceOverview().data
  // Rendu des résultats en priorité basse : la saisie et les filtres restent réactifs.
  const criteria = useDeferredValue(state)
  const search = useLibrarySearch(criteria)
  const now = clock.now()

  const collectionsById = useMemo(
    () => new Map((overview?.collections ?? []).map((collection) => [collection.id, collection])),
    [overview],
  )

  const data = search.data
  const isLoading = search.isPending
  const isError = search.isError
  const isEmpty = !isError && data?.totals.total === 0
  const isStale = search.isPlaceholderData || criteria !== state

  const subtitle = isLoading
    ? 'Chargement…'
    : isError
      ? 'Données indisponibles'
      : data
        ? totalsLabel(data.totals)
        : ''
  const filterNames = activeFilterNames(state)

  function renderContent() {
    if (isError) {
      const error = search.error
      return (
        <ErrorState
          title="Impossible de charger les contextes"
          code={isRepositoryUnavailable(error) ? error.summary : undefined}
          onRetry={() => {
            void search.refetch()
          }}
        >
          Le stockage n’a pas répondu. Les sessions Claude Code déjà connectées continuent de servir
          la dernière version en cache.
        </ErrorState>
      )
    }
    if (!data) return <LibrarySkeleton view={state.view} sort={state.sort} />
    if (isEmpty) return <LibraryEmpty />
    if (data.page.total === 0) {
      return (
        <NoResults
          query={state.query}
          activeFilters={filterNames}
          onClearFilters={() => {
            update({ tags: [], collectionId: null, scope: null, status: null })
          }}
          onClearQuery={() => {
            update({ query: '' })
          }}
        />
      )
    }
    return (
      <>
        <div className={cx(isStale && styles.stale)}>
          {state.view === 'cards' ? (
            <ContextCards contexts={data.page.items} collectionsById={collectionsById} />
          ) : (
            <ContextTable
              contexts={data.page.items}
              collectionsById={collectionsById}
              sort={criteria.sort}
              now={now}
            />
          )}
        </div>
        <Pagination
          page={data.page}
          onPageChange={(page) => {
            update({ page })
          }}
        />
      </>
    )
  }

  return (
    <>
      <title>Bibliothèque · Context Hub</title>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Bibliothèque</h1>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        <SearchField
          value={state.query}
          onCommit={(query) => {
            update({ query }, { replace: true })
          }}
        />
        <ButtonLink to={paths.newContext()} variant="primary" icon="plus">
          Nouveau contexte
        </ButtonLink>
      </header>
      {!isEmpty && (
        <FilterBar
          state={state}
          update={update}
          overview={overview}
          resultCount={isLoading || isError || !data ? null : data.page.total}
        />
      )}
      <section
        className={styles.content}
        aria-label="Résultats"
        aria-busy={isLoading || search.isFetching}
      >
        {renderContent()}
      </section>
    </>
  )
}
