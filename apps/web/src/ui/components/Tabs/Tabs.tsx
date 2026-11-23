import { useRef, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import { rovingIndex } from '../../lib/rovingIndex.ts'
import styles from './Tabs.module.scss'
import { tabId, tabPanelId } from './tabIds.ts'

export interface TabItem<T extends string> {
  id: T
  label: string
  count?: number
}

export interface TabsProps<T extends string> {
  label: string
  idPrefix: string
  items: readonly TabItem<T>[]
  selected: T
  onSelect: (id: T) => void
  className?: string | undefined
}

/** Onglets ARIA à activation automatique : les flèches déplacent le focus et sélectionnent. */
export function Tabs<T extends string>({
  label,
  idPrefix,
  items,
  selected,
  onSelect,
  className,
}: TabsProps<T>) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const target = rovingIndex(event.key, index, items.length, 'horizontal')
    const item = target === null ? undefined : items[target]
    if (target === null || !item) return
    event.preventDefault()
    onSelect(item.id)
    tabs.current[target]?.focus()
  }

  return (
    <div role="tablist" aria-label={label} className={cx(styles.tabs, className)}>
      {items.map((item, index) => {
        const isSelected = item.id === selected
        return (
          <button
            key={item.id}
            ref={(element) => {
              tabs.current[index] = element
            }}
            id={tabId(idPrefix, item.id)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={tabPanelId(idPrefix, item.id)}
            tabIndex={isSelected ? 0 : -1}
            className={styles.tab}
            onClick={() => {
              onSelect(item.id)
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index)
            }}
          >
            {item.label}
            {item.count !== undefined && (
              <>
                {/* Espace pour le nom accessible (« Tags 34 ») ; l'écart visuel vient du gap. */}{' '}
                <span className={styles.count}>{item.count}</span>
              </>
            )}
          </button>
        )
      })}
    </div>
  )
}

export interface TabPanelProps {
  idPrefix: string
  id: string
  children: ReactNode
  className?: string | undefined
}

export function TabPanel({ idPrefix, id, children, className }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      tabIndex={0}
      className={cx(styles.panel, className)}
    >
      {children}
    </div>
  )
}
