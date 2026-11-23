import type { ReactNode } from 'react'

import { Button } from '../Button/Button.tsx'
import { Icon } from '../Icon/Icon.tsx'
import styles from './ErrorState.module.scss'

export interface ErrorStateProps {
  title: string
  children?: ReactNode
  /** Code technique affiché en mono (ex. « SQLITE_BUSY · database is locked · req 7f3a91 »). */
  code?: string | undefined
  onRetry?: () => void
}

export function ErrorState({ title, children, code, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className={styles.errorState}>
      <Icon name="alertTriangle" size={18} className={styles.icon} />
      <div className={styles.content}>
        <strong className={styles.title}>{title}</strong>
        {children && <span className={styles.message}>{children}</span>}
        {code && <code className={styles.code}>{code}</code>}
      </div>
      {onRetry && (
        <Button size="sm" icon="refresh" className={styles.retry} onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  )
}
