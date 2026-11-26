import { useRef, type KeyboardEvent, type ReactNode } from 'react'

import {
  MISSION_QUEUE_FILTERS,
  type MissionFilterCounts,
  type MissionQueueFilter,
} from '@context-hub/domain/missions/types.ts'

import { Icon } from '../../../components/Icon/Icon.tsx'
import { Menu, type MenuItem, type MenuSelection } from '../../../components/Menu/Menu.tsx'
import { rovingIndex } from '../../../lib/rovingIndex.ts'
import { MISSION_FILTER_LABELS } from '../shared/missionPresentation.ts'
import styles from './MissionsPage.module.scss'

interface QueueFilterProps {
  value: MissionQueueFilter
  /** Compteurs de la liste ; absents pendant le chargement. */
  counts: MissionFilterCounts | undefined
  onChange: (filter: MissionQueueFilter) => void
}

/**
 * Filtre segmenté À traiter / À valider / Prêtes / Archivées / Toutes, avec compteurs (maquette 31).
 * Même comportement que `Segmented` (radiogroup, focus itinérant), dont le libellé n'accepte pas de
 * compteur stylé.
 */
export function QueueFilter({ value, counts, onChange }: QueueFilterProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = rovingIndex(event.key, index, MISSION_QUEUE_FILTERS.length, 'both')
    const filter = target === null ? undefined : MISSION_QUEUE_FILTERS[target]
    if (target === null || filter === undefined) return
    event.preventDefault()
    onChange(filter)
    buttons.current[target]?.focus()
  }

  return (
    <div role="radiogroup" aria-label="Filtrer par statut" className={styles.segmented}>
      {MISSION_QUEUE_FILTERS.map((filter, index) => {
        const checked = filter === value
        return (
          <button
            key={filter}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={styles.segment}
            onClick={() => {
              onChange(filter)
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index)
            }}
          >
            {MISSION_FILTER_LABELS[filter]}
            {counts && <span className={styles.segmentCount}>{counts[filter]}</span>}
          </button>
        )
      })}
    </div>
  )
}

interface FacetFilterProps {
  /** Nom du filtre (« Tags », « Repo »). */
  name: string
  /** Valeur affichée quand le filtre est actif, null sinon. */
  activeValue: string | null
  selection: MenuSelection
  values: readonly string[]
  isChecked: (value: string) => boolean
  onSelect: (value: string) => void
  onClear: () => void
}

/** Filtre par menu ; actif, il devient une chip accent avec une croix (« Tags : perf × »). */
export function FacetFilter({
  name,
  activeValue,
  selection,
  values,
  isChecked,
  onSelect,
  onClear,
}: FacetFilterProps) {
  const items: MenuItem[] =
    values.length === 0
      ? [{ id: 'none', label: 'Aucune valeur', disabled: true, onSelect: () => undefined }]
      : values.map((value) => ({
          id: value,
          label: value,
          checked: isChecked(value),
          onSelect: () => {
            onSelect(value)
          },
        }))
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
        className={styles.chipClear}
        aria-label={`Retirer le filtre ${name}`}
        onClick={onClear}
      >
        <Icon name="x" size={14} />
      </button>
    </span>
  )
}
