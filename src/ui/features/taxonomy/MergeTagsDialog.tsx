import { useId, useState } from 'react'

import { isValidTagName, normalizeTagName } from '../../../domain/taxonomy/tags.ts'
import type { Tag as TagModel } from '../../../domain/taxonomy/types.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { TextInput } from '../../components/Field/Field.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import styles from './Taxonomy.module.scss'
import { useMergePreview } from './useTaxonomy.ts'

const NEW_TAG = '__new__'

export interface MergeRequest {
  readonly sources: readonly string[]
  readonly target: string
}

export interface MergeTagsDialogProps {
  request: MergeRequest | null
  tags: readonly TagModel[]
  pending: boolean
  error?: string | null
  onConfirm: (request: MergeRequest) => void
  onCancel: () => void
}

/** « vue3 et vuejs », noms en mono, liaisons en texte courant. */
function NameList({ names }: { names: readonly string[] }) {
  return (
    <>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 && (index === names.length - 1 ? ' et ' : ', ')}
          <span className={styles.mono}>{name}</span>
        </span>
      ))}
    </>
  )
}

/** Dialog de fusion (maquette 17) : impact chiffré, aucune version créée, URI inchangées. */
export function MergeTagsDialog(props: MergeTagsDialogProps) {
  const key = props.request ? `${props.request.sources.join(',')}>${props.request.target}` : 'none'
  return <MergeForm key={key} {...props} />
}

function MergeForm({
  request,
  tags,
  pending,
  error = null,
  onConfirm,
  onCancel,
}: MergeTagsDialogProps) {
  const selectId = useId()
  const newTagId = useId()
  const impactId = useId()
  const sources = request?.sources ?? []
  const [choice, setChoice] = useState(request?.target ?? '')
  const [newName, setNewName] = useState('')
  const target = choice === NEW_TAG ? normalizeTagName(newName) : choice
  const targetValid = target !== '' && isValidTagName(target) && !sources.includes(target)
  const preview = useMergePreview(sources, target, request !== null && targetValid)
  const candidates = tags.filter((tag) => !sources.includes(tag.name))
  const byName = new Map(tags.map((tag) => [tag.name, tag]))

  return (
    <ConfirmDialog
      open={request !== null}
      title={`Fusionner ${plural(sources.length, 'tag', 'tags')}`}
      confirmLabel={targetValid ? `Fusionner dans ${target}` : 'Fusionner'}
      pending={pending}
      error={error}
      confirmDisabled={!targetValid || !preview.data}
      onConfirm={() => {
        onConfirm({ sources, target })
      }}
      onCancel={onCancel}
    >
      <div className={styles.dialogField}>
        <span className={styles.label}>Tags à fusionner</span>
        <div className={styles.chips}>
          {sources.map((name) => (
            <Tag key={name} name={name}>
              {name} · {byName.get(name)?.contextCount ?? 0}
            </Tag>
          ))}
        </div>
      </div>
      <div className={styles.dialogField}>
        <label htmlFor={selectId} className={styles.label}>
          Dans le tag
        </label>
        <select
          id={selectId}
          className={cx(styles.select, styles.mono)}
          value={choice}
          aria-describedby={impactId}
          onChange={(event) => {
            setChoice(event.target.value)
          }}
        >
          {candidates.map((tag) => (
            <option key={tag.name} value={tag.name}>
              {tag.name} · {plural(tag.contextCount, 'contexte', 'contextes')}
            </option>
          ))}
          <option value={NEW_TAG}>Nouveau tag…</option>
        </select>
        {choice === NEW_TAG && (
          <>
            <label htmlFor={newTagId} className="visually-hidden">
              Nom du nouveau tag
            </label>
            <TextInput
              id={newTagId}
              mono
              value={newName}
              placeholder="nom-du-tag"
              onChange={(event) => {
                setNewName(event.target.value)
              }}
            />
          </>
        )}
      </div>
      <div id={impactId} className={styles.impact} aria-live="polite">
        {!targetValid ? (
          <span>Choisissez un tag cible valide (minuscules, chiffres, tirets).</span>
        ) : !preview.data ? (
          <span>Calcul de l’impact…</span>
        ) : (
          <>
            <span>
              <strong>{plural(preview.data.affectedContexts, 'contexte', 'contextes')}</strong>{' '}
              {preview.data.affectedContexts <= 1 ? 'reçoit' : 'reçoivent'} le tag{' '}
              <span className={styles.mono}>{target}</span> (dont{' '}
              {plural(preview.data.affectedPublished, 'publié', 'publiés')}).
            </span>
            {preview.data.duplicatesAvoided > 0 && (
              <span>
                {plural(preview.data.duplicatesAvoided, 'contexte avait', 'contextes avaient')} déjà{' '}
                <span className={styles.mono}>{target}</span> : pas de doublon créé.
              </span>
            )}
            <span>
              <NameList names={sources} /> {sources.length > 1 ? 'sont supprimés' : 'est supprimé'}.
              Aucune version n’est créée, les URI ne changent pas.
            </span>
          </>
        )}
      </div>
    </ConfirmDialog>
  )
}
