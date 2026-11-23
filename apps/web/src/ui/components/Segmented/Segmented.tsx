import { useRef, type KeyboardEvent } from 'react'

import { cx } from '../../lib/cx.ts'
import { rovingIndex } from '../../lib/rovingIndex.ts'
import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import styles from './Segmented.module.scss'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: IconName
}

export interface SegmentedProps<T extends string> {
  /** Nom accessible du groupe (ex. « Affichage »). */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  tone?: 'neutral' | 'accent'
  size?: 'md' | 'sm'
  className?: string | undefined
}

/** Choix exclusif : radiogroup ARIA avec focus itinérant (flèches, Début, Fin). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  tone = 'neutral',
  size = 'md',
  className,
}: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function select(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    buttons.current[index]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const target = rovingIndex(event.key, index, options.length, 'both')
    if (target === null) return
    event.preventDefault()
    select(target)
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        styles.segmented,
        tone === 'accent' && styles.accent,
        size === 'sm' && styles.sm,
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={styles.option}
            onClick={() => {
              onChange(option.value)
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, index)
            }}
          >
            {option.icon && <Icon name={option.icon} size={14} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
