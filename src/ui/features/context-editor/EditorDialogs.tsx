import { useId, useState } from 'react'

import { lineDiff } from '../../../domain/context/diff.ts'
import { isValidFalsePositiveReason } from '../../../domain/context/editing.ts'
import type { ScanFinding } from '../../../domain/context/scan.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Field } from '../../components/Field/Field.tsx'
import { cx } from '../../lib/cx.ts'
import styles from './Editor.module.scss'

export interface FalsePositiveDialogProps {
  finding: ScanFinding | null
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** « Faux positif… » (décision phase 0) : motif obligatoire, transmis au serveur avec le brouillon. */
export function FalsePositiveDialog({ finding, onConfirm, onCancel }: FalsePositiveDialogProps) {
  const [reason, setReason] = useState('')
  const reasonId = useId()
  const close = () => {
    setReason('')
    onCancel()
  }
  return (
    <ConfirmDialog
      open={finding !== null}
      title={finding ? `Faux positif ligne ${finding.line}` : ''}
      confirmLabel="Ignorer ce signalement"
      confirmDisabled={!isValidFalsePositiveReason(reason)}
      onConfirm={() => {
        onConfirm(reason.trim())
        setReason('')
      }}
      onCancel={close}
    >
      <p>
        Le signalement est ignoré pour ce brouillon et débloque la publication. Le serveur refera le
        scan et conservera votre justification.
      </p>
      <Field label="Justification (requise)" htmlFor={reasonId}>
        <textarea
          id={reasonId}
          className={styles.textareaField}
          value={reason}
          placeholder="Ex. clé factice utilisée dans un exemple"
          onChange={(event) => {
            setReason(event.target.value)
          }}
        />
      </Field>
    </ConfirmDialog>
  )
}

export interface DiffDialogProps {
  open: boolean
  title: string
  before: string
  after: string
  onClose: () => void
}

/** « Voir les différences » (maquette 15) : version publiée entre-temps → votre brouillon. */
export function DiffDialog({ open, title, before, after, onClose }: DiffDialogProps) {
  const lines = open ? lineDiff(before, after) : []
  return (
    <ConfirmDialog
      open={open}
      title={title}
      confirmLabel="Retour à l’édition"
      className={styles.wideDialog}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <p className={styles.help}>
        Lignes <span className={styles.diffAdded}>+ ajoutées</span> par votre brouillon,{' '}
        <span className={styles.diffRemoved}>− retirées</span> par rapport à la version publiée.
      </p>
      <pre className={styles.diff} aria-label="Différences ligne à ligne">
        {lines.map((line, index) => (
          <span
            // Lignes sans identité propre : l'index est la seule clé stable de ce rendu figé.
            key={index}
            className={cx(
              styles.diffLine,
              line.kind === 'added' && styles.diffAdded,
              line.kind === 'removed' && styles.diffRemoved,
            )}
          >
            {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '− ' : '  '}
            {line.text}
          </span>
        ))}
      </pre>
    </ConfirmDialog>
  )
}
