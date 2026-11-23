import { useId, useState } from 'react'

import type { NewCollection } from '../../../application/ports/TaxonomyRepository.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Field, TextInput } from '../../components/Field/Field.tsx'

export interface CollectionDialogProps {
  /** null : création (« Nouvelle collection », aussi depuis l'Éditeur) ; sinon modification. */
  collection: Collection | null
  open: boolean
  pending: boolean
  error?: string | null
  onSubmit: (input: NewCollection) => void
  onCancel: () => void
}

/** Créer ou modifier une collection (nom, description). */
export function CollectionDialog(props: CollectionDialogProps) {
  // Une collection différente = un formulaire neuf. Jamais de clé liée à `open` : démonter un
  // <dialog> ouvert empêcherait le retour du focus au déclencheur.
  return <CollectionForm key={props.collection?.id ?? 'new'} {...props} />
}

function CollectionForm({
  collection,
  open,
  pending,
  error = null,
  onSubmit,
  onCancel,
}: CollectionDialogProps) {
  const [name, setName] = useState(collection?.name ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const nameId = useId()
  const descriptionId = useId()
  const isNew = collection === null
  const reset = () => {
    setName(collection?.name ?? '')
    setDescription(collection?.description ?? '')
  }
  return (
    <ConfirmDialog
      open={open}
      title={isNew ? 'Nouvelle collection' : `Modifier « ${collection.name} »`}
      confirmLabel={isNew ? 'Créer la collection' : 'Enregistrer'}
      pending={pending}
      error={error}
      confirmDisabled={name.trim() === ''}
      onConfirm={() => {
        onSubmit({ name, description })
        reset()
      }}
      onCancel={() => {
        reset()
        onCancel()
      }}
    >
      <Field label="Nom" htmlFor={nameId}>
        <TextInput
          id={nameId}
          value={name}
          required
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
      </Field>
      <Field label="Description" htmlFor={descriptionId}>
        <TextInput
          id={descriptionId}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
          }}
        />
      </Field>
    </ConfirmDialog>
  )
}
