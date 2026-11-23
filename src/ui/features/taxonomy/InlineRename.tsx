import { useEffect, useId, useRef, useState } from 'react'

import { planTagRename } from '../../../domain/taxonomy/tags.ts'
import type { Tag as TagModel } from '../../../domain/taxonomy/types.ts'
import { Button } from '../../components/Button/Button.tsx'
import { plural } from '../../lib/format.ts'
import styles from './Taxonomy.module.scss'

export interface InlineRenameProps {
  tag: TagModel
  tags: readonly TagModel[]
  pending: boolean
  error: string | null
  onSubmit: (to: string, isMerge: boolean) => void
  onCancel: () => void
}

/** Renommage en ligne (maquette 16) : vers un nom existant, l'action devient « Fusionner ». */
export function InlineRename({ tag, tags, pending, error, onSubmit, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(tag.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()
  const plan = planTagRename(tags, tag.name, value)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  function submit() {
    if (plan.kind === 'rename') onSubmit(plan.to, false)
    else if (plan.kind === 'merge') onSubmit(plan.into.name, true)
    else if (plan.kind === 'unchanged') onCancel()
  }

  return (
    <div className={styles.rename}>
      <div className={styles.renameRow}>
        <label htmlFor={`${messageId}-input`} className="visually-hidden">
          Nouveau nom de {tag.name}
        </label>
        <input
          ref={inputRef}
          id={`${messageId}-input`}
          className={styles.renameInput}
          value={value}
          aria-describedby={messageId}
          aria-invalid={plan.kind === 'invalid'}
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
            if (event.key === 'Escape') onCancel()
          }}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={pending || plan.kind === 'invalid'}
          onClick={submit}
        >
          {plan.kind === 'merge' ? 'Fusionner' : 'Renommer'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
      <span
        id={messageId}
        className={plan.kind === 'invalid' ? styles.renameError : styles.renameWarning}
        aria-live="polite"
      >
        {plan.kind === 'merge' &&
          `« ${plan.into.name} » existe déjà (${plural(plan.into.contextCount, 'contexte', 'contextes')}) : renommer revient à fusionner.`}
        {plan.kind === 'invalid' && 'Minuscules, chiffres et tirets uniquement.'}
      </span>
      {error && (
        <span role="alert" className={styles.renameError}>
          {error}
        </span>
      )}
    </div>
  )
}
