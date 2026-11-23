import { useCopyToClipboard } from '../../hooks/useCopyToClipboard.ts'
import { cx } from '../../lib/cx.ts'
import { Button } from '../Button/Button.tsx'
import styles from './CopyField.module.scss'

export interface CopyFieldProps {
  /** Valeur copiée. */
  value: string
  /** Nom accessible du bouton, ex. « Copier la mention ». */
  copyLabel: string
  /** Bloc multi-ligne (commande, JSON) plutôt qu'une ligne tronquée. */
  multiline?: boolean
  className?: string | undefined
}

const ANNOUNCEMENTS = {
  idle: '',
  copied: 'Copié dans le presse-papiers',
  error: 'Copie impossible',
} as const

export function CopyField({ value, copyLabel, multiline = false, className }: CopyFieldProps) {
  const { status, copy } = useCopyToClipboard()
  const copied = status === 'copied'

  return (
    <div className={cx(styles.copyField, multiline && styles.multiline, className)}>
      <code className={styles.value} title={multiline ? undefined : value}>
        {value}
      </code>
      <Button
        size="sm"
        aria-label={copyLabel}
        icon={copied ? 'check' : undefined}
        className={cx(styles.button, copied && styles.copied)}
        onClick={() => {
          void copy(value)
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </Button>
      <span role="status" className="visually-hidden">
        {ANNOUNCEMENTS[status]}
      </span>
    </div>
  )
}
