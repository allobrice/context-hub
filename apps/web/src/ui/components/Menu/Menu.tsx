import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import { rovingIndex } from '../../lib/rovingIndex.ts'
import { Button } from '../Button/Button.tsx'
import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import styles from './Menu.module.scss'

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  disabled?: boolean
  /** État coché (menus de sélection). */
  checked?: boolean
  /** Contenu secondaire aligné à droite (ex. compteur). */
  meta?: ReactNode
  onSelect: () => void
}

/** `none` : actions ; `single` : menuitemradio, se ferme ; `multiple` : menuitemcheckbox, reste ouvert. */
export type MenuSelection = 'none' | 'single' | 'multiple'

export interface MenuProps {
  /** Nom accessible du menu (et du déclencheur s'il n'a pas de contenu visible). */
  label: string
  items: readonly MenuItem[]
  selection?: MenuSelection
  /** Contenu visible du déclencheur. Absent : bouton icône « … » nommé par `label`. */
  trigger?: ReactNode
  triggerClassName?: string | undefined
  align?: 'start' | 'end'
}

const ITEM_ROLES = {
  none: 'menuitem',
  single: 'menuitemradio',
  multiple: 'menuitemcheckbox',
} as const

/** Bouton de menu ARIA (APG menu button) : flèches, Début/Fin, Échap rend le focus au déclencheur. */
export function Menu({
  label,
  items,
  selection = 'none',
  trigger,
  triggerClassName,
  align = 'end',
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const enabledIndexes = items.flatMap((item, index) => (item.disabled ? [] : [index]))

  function focusItem(position: number) {
    const index = enabledIndexes.at(position)
    if (index !== undefined) itemRefs.current[index]?.focus()
  }

  useEffect(() => {
    if (!open) return
    const checkedIndex = enabledIndexes.findIndex((index) => items[index]?.checked)
    focusItem(Math.max(0, checkedIndex))
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
    // Le focus initial ne doit être posé qu'à l'ouverture, pas à chaque changement de `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event: KeyboardEvent) {
    const focused = itemRefs.current.findIndex((item) => item === document.activeElement)
    const target = rovingIndex(
      event.key,
      enabledIndexes.indexOf(focused),
      enabledIndexes.length,
      'vertical',
    )
    if (target !== null) {
      event.preventDefault()
      focusItem(target)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close({ restoreFocus: true })
    } else if (event.key === 'Tab') {
      close({ restoreFocus: false })
    }
  }

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: () => {
      setOpen((value) => !value)
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setOpen(true)
      }
    },
  }

  return (
    <div ref={rootRef} className={styles.menu}>
      {trigger === undefined ? (
        <Button
          icon="more"
          aria-label={label}
          title={label}
          className={triggerClassName}
          {...triggerProps}
        />
      ) : (
        <Button size="sm" className={triggerClassName} {...triggerProps}>
          {trigger}
          <Icon name="chevronDown" size={14} />
        </Button>
      )}
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(styles.list, align === 'start' && styles.alignStart)}
          onKeyDown={handleMenuKeyDown}
          tabIndex={-1}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              type="button"
              role={ITEM_ROLES[selection]}
              aria-checked={selection === 'none' ? undefined : Boolean(item.checked)}
              tabIndex={-1}
              disabled={item.disabled}
              className={styles.item}
              onClick={() => {
                if (selection !== 'multiple') close({ restoreFocus: true })
                item.onSelect()
              }}
            >
              {selection !== 'none' && (
                <span className={styles.check} aria-hidden="true">
                  {item.checked && <Icon name="check" size={14} />}
                </span>
              )}
              {item.icon && <Icon name={item.icon} size={14} />}
              <span className={styles.itemLabel}>{item.label}</span>
              {item.meta !== undefined && <span className={styles.meta}>{item.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
