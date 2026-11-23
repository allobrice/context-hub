import type { ReactNode } from 'react'

import { isCollectionListed } from '../../../domain/taxonomy/collections.ts'
import type { WorkspaceOverview } from '../../../application/ports/WorkspaceRepository.ts'
import { CONTEXT_STATUSES, SCOPE_KINDS } from '../../../domain/context/types.ts'
import { LIBRARY_SORTS, type LibrarySort } from '../../../domain/library/criteria.ts'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Menu, type MenuItem, type MenuSelection } from '../../components/Menu/Menu.tsx'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import { plural } from '../../lib/format.ts'
import { SCOPE_LABELS, STATUS_LABELS } from '../../lib/labels.ts'
import styles from './FilterBar.module.scss'
import type { LibraryUrlState, LibraryView } from './libraryParams.ts'
import type { UpdateLibraryState } from './useLibraryUrlState.ts'

const SORT_LABELS: Readonly<Record<LibrarySort, string>> = {
  'updated-desc': 'Mis à jour (récent)',
  'updated-asc': 'Mis à jour (ancien)',
  'title-asc': 'Titre A → Z',
  'title-desc': 'Titre Z → A',
}

interface FilterProps {
  name: string
  /** Valeur affichée quand le filtre est actif (« Équipe »), null sinon. */
  activeValue: string | null
  items: readonly MenuItem[]
  selection: MenuSelection
  onClear: () => void
}

function Filter({ name, activeValue, items, selection, onClear }: FilterProps) {
  const menu = (trigger: ReactNode, className?: string) => (
    <Menu
      label={`Filtrer par ${name.toLowerCase()}`}
      selection={selection}
      trigger={trigger}
      triggerClassName={className}
      items={items}
      align="start"
    />
  )
  if (activeValue === null) return menu(name)
  return (
    <span className={styles.chip}>
      {menu(`${name} : ${activeValue}`, styles.chipTrigger)}
      <button
        type="button"
        className={styles.clear}
        aria-label={`Retirer le filtre ${name}`}
        onClick={onClear}
      >
        <Icon name="x" size={14} />
      </button>
    </span>
  )
}

export interface FilterBarProps {
  state: LibraryUrlState
  update: UpdateLibraryState
  overview: WorkspaceOverview | undefined
  /** Nombre de résultats, ou null s'il est inconnu (chargement, erreur). */
  resultCount: number | null
}

export function FilterBar({ state, update, overview, resultCount }: FilterBarProps) {
  const collections = overview?.collections.filter(isCollectionListed) ?? []
  const collectionName =
    collections.find((c) => c.id === state.collectionId)?.name ?? state.collectionId

  return (
    <div className={styles.bar}>
      <Filter
        name="Tags"
        selection="multiple"
        activeValue={state.tags.length > 0 ? state.tags.join(', ') : null}
        onClear={() => {
          update({ tags: [] })
        }}
        items={(overview?.tagNames ?? []).map((tag) => ({
          id: tag,
          label: tag,
          checked: state.tags.includes(tag),
          onSelect: () => {
            update({
              tags: state.tags.includes(tag)
                ? state.tags.filter((t) => t !== tag)
                : [...state.tags, tag],
            })
          },
        }))}
      />
      <Filter
        name="Collection"
        selection="single"
        activeValue={collectionName}
        onClear={() => {
          update({ collectionId: null })
        }}
        items={collections.map((collection) => ({
          id: collection.id,
          label: collection.name,
          meta: collection.contextCount,
          checked: collection.id === state.collectionId,
          onSelect: () => {
            update({ collectionId: collection.id })
          },
        }))}
      />
      <Filter
        name="Portée"
        selection="single"
        activeValue={state.scope && SCOPE_LABELS[state.scope]}
        onClear={() => {
          update({ scope: null })
        }}
        items={SCOPE_KINDS.map((kind) => ({
          id: kind,
          label: SCOPE_LABELS[kind],
          meta: overview?.scopeCounts[kind],
          checked: kind === state.scope,
          onSelect: () => {
            update({ scope: kind })
          },
        }))}
      />
      <Filter
        name="Statut"
        selection="single"
        activeValue={state.status && STATUS_LABELS[state.status]}
        onClear={() => {
          update({ status: null })
        }}
        items={CONTEXT_STATUSES.map((status) => ({
          id: status,
          label: STATUS_LABELS[status],
          checked: status === state.status,
          onSelect: () => {
            update({ status })
          },
        }))}
      />

      <span className={styles.count} role="status">
        {resultCount !== null && plural(resultCount, 'résultat', 'résultats')}
      </span>
      <label className={styles.sort}>
        Trier
        <select
          className={styles.sortSelect}
          value={state.sort}
          onChange={(event) => {
            const sort = LIBRARY_SORTS.find((candidate) => candidate === event.target.value)
            if (sort) update({ sort })
          }}
        >
          {LIBRARY_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </label>
      <Segmented<LibraryView>
        label="Affichage"
        value={state.view}
        onChange={(view) => {
          update({ view })
        }}
        options={[
          { value: 'table', label: 'Tableau', icon: 'list' },
          { value: 'cards', label: 'Cartes', icon: 'grid' },
        ]}
      />
    </div>
  )
}
