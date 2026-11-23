import type { ComponentPropsWithRef, ReactNode } from 'react'

import { cx } from '../../lib/cx.ts'
import styles from './Field.module.scss'
import { fieldHintId } from './fieldIds.ts'

export interface FieldProps {
  label: ReactNode
  /** Id du contrôle enfant ; l'aide reçoit l'id `fieldHintId(htmlFor)`. */
  htmlFor: string
  hint?: ReactNode
  /** Contenu aligné à droite du libellé (ex. compteur « 76 / 160 »). */
  aside?: ReactNode
  children: ReactNode
  className?: string | undefined
}

export function Field({ label, htmlFor, hint, aside, children, className }: FieldProps) {
  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.head}>
        <label htmlFor={htmlFor} className={styles.label}>
          {label}
        </label>
        {aside && <span className={styles.aside}>{aside}</span>}
      </div>
      {children}
      {hint && (
        <p id={fieldHintId(htmlFor)} className={styles.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}

interface ControlLook {
  mono?: boolean
}

export function TextInput({
  mono = false,
  className,
  ...rest
}: ComponentPropsWithRef<'input'> & ControlLook) {
  return <input className={cx(styles.control, mono && styles.mono, className)} {...rest} />
}

export function Select({
  mono = false,
  className,
  ...rest
}: ComponentPropsWithRef<'select'> & ControlLook) {
  return <select className={cx(styles.control, mono && styles.mono, className)} {...rest} />
}
