import type { ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import { Icon } from '../Icon/Icon.tsx'
import styles from './Tag.module.scss'

export interface TagProps {
  name: string
  size?: 'sm' | 'lg'
  /** Rend le tag supprimable (chip) avec un bouton « Retirer le tag {name} ». */
  onRemove?: () => void
  /** Contenu affiché à la place du nom (ex. « vue3 · 5 »). */
  children?: ReactNode
  className?: string | undefined
}

export function Tag({ name, size = 'sm', onRemove, children, className }: TagProps) {
  return (
    <span
      className={cx(
        styles.tag,
        size === 'lg' && styles.lg,
        onRemove && styles.removable,
        className,
      )}
    >
      {children ?? name}
      {onRemove && (
        <button
          type="button"
          className={styles.remove}
          aria-label={`Retirer le tag ${name}`}
          onClick={onRemove}
        >
          <Icon name="x" size={12} strokeWidth={2.5} />
        </button>
      )}
    </span>
  )
}
