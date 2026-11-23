import { useId, type ReactNode } from 'react'

import { Button } from '../Button/Button.tsx'
import { Dialog } from '../Dialog/Dialog.tsx'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  /** `danger` : action destructive → alertdialog et bouton danger. */
  tone?: 'primary' | 'danger'
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmation d'une action à impact (archivage, restauration, suppression). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  tone = 'primary',
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const descriptionId = useId()
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      role={tone === 'danger' ? 'alertdialog' : 'dialog'}
      describedBy={descriptionId}
      footer={
        <>
          <Button onClick={onCancel}>Annuler</Button>
          <Button variant={tone} onClick={onConfirm} disabled={pending} aria-busy={pending}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div id={descriptionId}>{children}</div>
    </Dialog>
  )
}
