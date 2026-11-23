import { useId, type ReactNode } from 'react'

import { Icon } from '../../components/Icon/Icon.tsx'
import type { IconName } from '../../components/Icon/icons.ts'
import { cx } from '../../lib/cx.ts'
import styles from './Editor.module.scss'

export interface EditorAlertProps {
  /** `danger` : role="alert" (annoncé immédiatement) ; `info` : role="status". */
  tone: 'danger' | 'info'
  icon: IconName
  /** Titre en gras, qui nomme aussi l'alerte. */
  title?: string
  children: ReactNode
  actions?: ReactNode
}

/** Bandeau de l'Éditeur : conflit, échec d'enregistrement, copie locale, retour arrière (maquette 15). */
export function EditorAlert({ tone, icon, title, children, actions }: EditorAlertProps) {
  const titleId = useId()
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-labelledby={title ? titleId : undefined}
      className={cx(styles.alert, tone === 'info' && styles.alertInfo)}
    >
      <Icon name={icon} className={styles.alertIcon} />
      <div className={styles.alertText}>
        {title && <strong id={titleId}>{title}</strong>}
        <span>{children}</span>
      </div>
      {actions}
    </div>
  )
}
