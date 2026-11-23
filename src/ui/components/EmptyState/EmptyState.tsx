import type { ReactNode } from 'react'

import { Icon } from '../Icon/Icon.tsx'
import type { IconName } from '../Icon/icons.ts'
import styles from './EmptyState.module.scss'

export interface EmptyStateProps {
  icon: IconName
  title: string
  children?: ReactNode
  actions?: ReactNode
}

export function EmptyState({ icon, title, children, actions }: EmptyStateProps) {
  return (
    <section className={styles.emptyState} aria-label={title}>
      <div className={styles.icon}>
        <Icon name={icon} size={24} />
      </div>
      <h2 className={styles.title}>{title}</h2>
      {children && <p className={styles.description}>{children}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  )
}
