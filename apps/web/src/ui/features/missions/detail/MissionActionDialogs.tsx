import { useId, useState } from 'react'
import { useNavigate } from 'react-router'

import type { Mission } from '@context-hub/domain/missions/types.ts'

import { paths } from '../../../app/paths.ts'
import { ConfirmDialog } from '../../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Field } from '../../../components/Field/Field.tsx'
import { failureOf } from '../../../lib/errors.ts'
import { MissionFormDialog } from '../shared/MissionFormDialog.tsx'
import type { useMissionAction } from '../shared/useMissions.ts'
import styles from './MissionDetail.module.scss'

/** Actions de l'en-tête qui passent par un dialog (SPEC §8.4). */
export type MissionDialog = 'reject' | 'drop' | 'release' | 'edit'

export type MissionActionMutation = ReturnType<typeof useMissionAction>

export interface MissionActionDialogsProps {
  dialog: MissionDialog | null
  mission: Mission
  action: MissionActionMutation
  onClose: () => void
}

/**
 * Rejeter (raison facultative, la mission est supprimée), Abandonner (raison obligatoire), Libérer
 * (réservation d'une session) et Modifier. L'échec reste affiché dans le dialog qui l'a déclenché.
 */
export function MissionActionDialogs({
  dialog,
  mission,
  action,
  onClose,
}: MissionActionDialogsProps) {
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const reasonId = useId()
  const close = () => {
    action.reset()
    setReason('')
    onClose()
  }
  const done = () => {
    setReason('')
    onClose()
  }
  const reasonField = (label: string, placeholder: string) => (
    <Field label={label} htmlFor={reasonId}>
      <textarea
        id={reasonId}
        className={styles.reason}
        value={reason}
        placeholder={placeholder}
        onChange={(event) => {
          setReason(event.target.value)
        }}
      />
    </Field>
  )
  const common = {
    tone: 'danger',
    pending: action.isPending,
    error: failureOf(action.error),
    onCancel: close,
  } as const

  return (
    <>
      <ConfirmDialog
        {...common}
        open={dialog === 'reject'}
        title="Rejeter la mission ?"
        confirmLabel="Rejeter la mission"
        onConfirm={() => {
          const trimmed = reason.trim()
          action.mutate(
            { kind: 'reject', reason: trimmed === '' ? null : trimmed },
            {
              onSuccess: () => {
                done()
                void navigate(paths.missions())
              },
            },
          )
        }}
      >
        <p>
          « {mission.title} » sera supprimée et ne sera jamais proposée aux sessions. Le rejet reste
          tracé dans l’historique du lot.
        </p>
        {reasonField('Raison (facultative)', 'Ex. constat erroné, déjà corrigé')}
      </ConfirmDialog>

      <ConfirmDialog
        {...common}
        open={dialog === 'drop'}
        title="Abandonner la mission ?"
        confirmLabel="Abandonner la mission"
        confirmDisabled={reason.trim() === ''}
        onConfirm={() => {
          action.mutate({ kind: 'drop', reason: reason.trim() }, { onSuccess: done })
        }}
      >
        <p>
          La mission est archivée avec votre raison et ne sera plus proposée aux sessions. Vous
          pourrez la rouvrir.
        </p>
        {reasonField('Raison (requise)', 'Ex. doublon de la PR !4790')}
      </ConfirmDialog>

      {mission.status === 'in_progress' && (
        <ConfirmDialog
          {...common}
          open={dialog === 'release'}
          title="Libérer la mission ?"
          confirmLabel="Libérer la mission"
          onConfirm={() => {
            action.mutate({ kind: 'release' }, { onSuccess: done })
          }}
        >
          <p>
            La session <span className={styles.mono}>{mission.claim.session.sessionLabel}</span> (
            {mission.claim.session.userName}) perd sa réservation : la mission redevient prête et
            une autre session pourra la prendre. Prévenez-la si elle travaille encore dessus.
          </p>
        </ConfirmDialog>
      )}

      {dialog === 'edit' && (
        <MissionFormDialog
          open
          mode={{ kind: 'edit', mission }}
          onCancel={onClose}
          onSaved={onClose}
        />
      )}
    </>
  )
}
