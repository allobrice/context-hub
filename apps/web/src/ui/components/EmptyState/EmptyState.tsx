import type { ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import styles from './EmptyState.module.scss'

export interface EmptyStateProps {
  icon: IconName
  title: string
  children?: ReactNode
  actions?: ReactNode
  /** `danger` : erreur bloquante (404). */
  tone?: 'neutral' | 'danger'
  /** Ligne technique sous les actions (code d'erreur…). */
  footer?: ReactNode
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  tone = 'neutral',
  footer,
}: EmptyStateProps) {
  return (
    <section className={styles.emptyState} aria-label={title}>
      <div className={cx(styles.icon, tone === 'danger' && styles.danger)}>
        <Icon name={icon} size={24} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {children && <p className={styles.description}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
      {footer && <p className={styles.footer}>{footer}</p>}
    </section>
  )
}
