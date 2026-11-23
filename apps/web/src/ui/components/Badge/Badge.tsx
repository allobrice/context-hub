import type { ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import styles from './Badge.module.scss'

export type BadgeTone = 'ok' | 'warn' | 'danger' | 'accent' | 'neutral'

export interface BadgeProps {
  tone?: BadgeTone
  /** Point coloré : la couleur n'est jamais le seul porteur d'information, le libellé reste visible. */
  dot?: boolean
  className?: string | undefined
  children: ReactNode
}

export function Badge({ tone = 'neutral', dot = false, className, children }: BadgeProps) {
  return (
    <span className={cx(styles.badge, styles[tone], className)}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  )
}
