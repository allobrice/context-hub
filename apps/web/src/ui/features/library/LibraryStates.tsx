import { paths } from '../../app/paths.ts'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import styles from './LibraryStates.module.scss'

/** Bibliothèque vide (maquette 04) : ce qu'est un contexte, et comment commencer. */
export function LibraryEmpty() {
  return (
    <EmptyState
      icon="book"
      title="Aucun contexte pour l’instant"
      actions={
        <>
          <ButtonLink to={paths.newContext()} variant="primary" icon="plus">
            Créer un contexte
          </ButtonLink>
          <ButtonLink to={paths.mcp}>Connecter Claude Code</ButtonLink>
        </>
      }
    >
      Un contexte est un bloc Markdown réutilisable : conventions, décisions, checklists. Une fois
      publié, vos sessions Claude Code le lisent via le serveur MCP, par recherche ou par{' '}
      <span className={styles.mono}>@context-hub:context://…</span>
    </EmptyState>
  )
}

export interface NoResultsProps {
  query: string
  /** Noms des filtres actifs (« Portée », « Tags »…). */
  activeFilters: readonly string[]
  onClearFilters: () => void
  onClearQuery: () => void
}

function clearFiltersLabel(activeFilters: readonly string[]): string {
  return activeFilters.length === 1
    ? `Retirer le filtre ${activeFilters[0] ?? ''}`
    : `Retirer les filtres (${activeFilters.length})`
}

/** Aucun résultat (maquette 07) : rappelle la requête et propose une sortie pour chaque cause. */
export function NoResults({ query, activeFilters, onClearFilters, onClearQuery }: NoResultsProps) {
  const trimmed = query.trim()
  const filterCount = activeFilters.length
  return (
    <EmptyState
      icon="search"
      title={
        trimmed
          ? `Aucun contexte ne correspond à « ${trimmed} »`
          : 'Aucun contexte ne correspond aux filtres'
      }
      actions={
        <>
          {filterCount > 0 && (
            <Button size="sm" onClick={onClearFilters}>
              {clearFiltersLabel(activeFilters)}
            </Button>
          )}
          {trimmed && (
            <Button size="sm" onClick={onClearQuery}>
              Effacer la recherche
            </Button>
          )}
          {trimmed && (
            <ButtonLink to={paths.newContext(trimmed)} size="sm" variant="primary">
              Créer « {trimmed} »
            </ButtonLink>
          )}
        </>
      }
    >
      La recherche porte sur le titre, la description, les tags et le contenu.
      {filterCount > 0 &&
        ` ${filterCount} ${filterCount === 1 ? 'filtre est actif' : 'filtres sont actifs'}.`}
    </EmptyState>
  )
}
