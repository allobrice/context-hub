import { useId, useState } from 'react'

import { slugify } from '@context-hub/domain/context/slug.ts'
import { deletionTargets } from '@context-hub/domain/taxonomy/collections.ts'
import type { Collection } from '@context-hub/domain/taxonomy/types.ts'
import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { plural } from '../../lib/format.ts'
import styles from './Taxonomy.module.scss'

export interface CollectionDeletion {
  readonly targetId: string
  readonly addFormerNameAsTag: boolean
}

export interface DeleteCollectionDialogProps {
  collection: Collection | null
  collections: readonly Collection[]
  pending: boolean
  error?: string | null
  onConfirm: (deletion: CollectionDeletion) => void
  onCancel: () => void
}

/**
 * Alertdialog de suppression (maquette 22) : impact chiffré, collection cible obligatoire
 * (« Sans collection » par défaut), option « Ajouter le tag {ancien-nom} ». Aucun contexte supprimé.
 */
export function DeleteCollectionDialog(props: DeleteCollectionDialogProps) {
  return <DeleteForm key={props.collection?.id ?? 'none'} {...props} />
}

function DeleteForm({
  collection,
  collections,
  pending,
  error = null,
  onConfirm,
  onCancel,
}: DeleteCollectionDialogProps) {
  const targetId = useId()
  const [target, setTarget] = useState(UNCATEGORIZED_COLLECTION_ID)
  const [addTag, setAddTag] = useState(true)
  const targets = collection ? deletionTargets(collections, collection.id) : []
  const formerTag = collection ? slugify(collection.name) : ''
  const count = collection?.contextCount ?? 0

  return (
    <ConfirmDialog
      open={collection !== null}
      tone="danger"
      title={`Supprimer la collection « ${collection?.name ?? ''} » ?`}
      confirmLabel={count > 0 ? 'Déplacer et supprimer' : 'Supprimer'}
      pending={pending}
      error={error}
      confirmDisabled={!targets.some((candidate) => candidate.id === target)}
      onConfirm={() => {
        onConfirm({ targetId: target, addFormerNameAsTag: count > 0 && addTag })
      }}
      onCancel={onCancel}
    >
      {count === 0 ? (
        <p>Elle est vide : aucun contexte n’est concerné.</p>
      ) : (
        <>
          <p>
            Elle contient <strong>{plural(count, 'contexte', 'contextes')}</strong>, dont{' '}
            {plural(collection?.publishedCount ?? 0, 'publié', 'publiés')} et lus par les sessions
            de l’équipe. Choisissez où les déplacer : aucun contexte n’est supprimé.
          </p>
          <div className={styles.dialogField}>
            <label htmlFor={targetId} className={styles.label}>
              Déplacer les contextes vers
            </label>
            <select
              id={targetId}
              className={styles.select}
              value={target}
              required
              onChange={(event) => {
                setTarget(event.target.value)
              }}
            >
              {targets.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </div>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={addTag}
              onChange={(event) => {
                setAddTag(event.target.checked)
              }}
            />
            <span>
              Ajouter le tag <span className={styles.mono}>{formerTag}</span> aux contextes déplacés
            </span>
          </label>
        </>
      )}
    </ConfirmDialog>
  )
}
