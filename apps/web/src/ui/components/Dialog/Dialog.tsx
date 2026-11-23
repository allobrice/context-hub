import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react'

import { cx } from '../../lib/cx.ts'
import { IconButton } from '../IconButton/IconButton.tsx'
import styles from './Dialog.module.scss'

export interface DialogProps {
  open: boolean
  /** Appelé sur Échap, sur « Fermer » et par les actions du pied de dialog. */
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** `alertdialog` pour une confirmation destructive (suppression). */
  role?: 'dialog' | 'alertdialog' | undefined
  /** Id d'un élément qui décrit le dialog (impact chiffré…). */
  describedBy?: string
  className?: string | undefined
}

/**
 * Dialog modal sur l'élément natif <dialog> : focus piégé, Échap et inertie du fond fournis par
 * le navigateur. Le focus revient explicitement à l'élément qui avait ouvert le dialog.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  role = 'dialog',
  describedBy,
  className,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  function handleCancel(event: SyntheticEvent) {
    // Échap : on laisse le parent décider (il repasse `open` à false).
    event.preventDefault()
    onClose()
  }

  function handleNativeClose() {
    openerRef.current?.focus()
    openerRef.current = null
  }

  return (
    <dialog
      ref={dialogRef}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={describedBy}
      className={cx(styles.dialog, className)}
      onCancel={handleCancel}
      onClose={handleNativeClose}
    >
      {open && (
        <>
          <div className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <IconButton icon="x" label="Fermer" onClick={onClose} />
          </div>
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </>
      )}
    </dialog>
  )
}
