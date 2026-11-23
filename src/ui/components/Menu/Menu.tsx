import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

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
  onSelect: () => void
}

export interface MenuProps {
  /** Nom accessible du bouton déclencheur (ex. « Plus d’actions »). */
  label: string
  items: readonly MenuItem[]
}

/** Bouton de menu ARIA (menu button) : flèches, Début/Fin, Échap rend le focus au déclencheur. */
export function Menu({ label, items }: MenuProps) {
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
    focusItem(0)
    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
    }
    // focusItem ne dépend que des refs et de items : seul `open` doit relancer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close({ restoreFocus }: { restoreFocus: boolean }) {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus()
  }

  function handleMenuKeyDown(event: KeyboardEvent) {
    const current = enabledIndexes.indexOf(
      itemRefs.current.findIndex((item) => item === document.activeElement),
    )
    const target = rovingIndex(event.key, current, enabledIndexes.length, 'vertical')
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

  return (
    <div ref={rootRef} className={styles.menu}>
      <Button
        ref={triggerRef}
        icon="more"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          setOpen((value) => !value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      />
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={styles.list}
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
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              className={styles.item}
              onClick={() => {
                close({ restoreFocus: true })
                item.onSelect()
              }}
            >
              {item.icon && <Icon name={item.icon} size={14} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
