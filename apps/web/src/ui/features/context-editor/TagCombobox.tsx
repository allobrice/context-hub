import { useId, useState, type KeyboardEvent } from 'react'

import { suggestTags } from '@context-hub/domain/taxonomy/tags.ts'
import type { Tag as TagModel } from '@context-hub/domain/taxonomy/types.ts'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import styles from './Editor.module.scss'

export interface TagComboboxProps {
  /** Id de l'input, relié au libellé du champ. */
  id: string
  tags: readonly TagModel[]
  value: readonly string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
}

type Option =
  | { readonly kind: 'existing'; readonly tag: TagModel }
  | { readonly kind: 'create'; readonly name: string }

/**
 * Combobox ARIA multi-valeurs (APG « combobox with listbox popup ») : chips supprimables,
 * suggestions avec compteurs, création d'un tag, ↑↓ / Entrée / Échap, Retour arrière retire le dernier.
 */
export function TagCombobox({ id, tags, value, onAdd, onRemove }: TagComboboxProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const { matches, creatable } = suggestTags(tags, query, value)
  const options: Option[] = [
    ...matches.map((tag): Option => ({ kind: 'existing', tag })),
    ...(creatable ? [{ kind: 'create' as const, name: creatable }] : []),
  ]
  const expanded = open && options.length > 0
  const activeIndex = Math.min(active, options.length - 1)
  const optionId = (index: number) => `${listId}-option-${index}`

  function choose(option: Option | undefined) {
    if (!option) return
    onAdd(option.kind === 'existing' ? option.tag.name : option.name)
    setQuery('')
    setActive(0)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setOpen(true)
        setActive((index) => (index + 1) % Math.max(options.length, 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setOpen(true)
        setActive((index) => (index - 1 + options.length) % Math.max(options.length, 1))
        break
      case 'Enter':
        if (expanded) {
          event.preventDefault()
          choose(options[activeIndex])
        }
        break
      case 'Escape':
        if (expanded) {
          event.preventDefault()
          setOpen(false)
        }
        break
      case 'Backspace': {
        const last = value.at(-1)
        if (query === '' && last !== undefined) onRemove(last)
        break
      }
    }
  }

  return (
    <div className={styles.combobox}>
      <div className={styles.tagInput}>
        {value.map((tag) => (
          <Tag
            key={tag}
            name={tag}
            onRemove={() => {
              onRemove(tag)
            }}
          />
        ))}
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? optionId(activeIndex) : undefined}
          className={styles.tagField}
          placeholder={value.length === 0 ? 'Ajouter un tag…' : ''}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => {
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Suggestions de tags"
        className={styles.suggestions}
        hidden={!expanded}
      >
        {options.map((option, index) => (
          // APG combobox : le clavier reste dans l'input (aria-activedescendant) ; les options ne
          // reçoivent jamais le focus et le clic n'est qu'un raccourci souris.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
          <div
            key={option.kind === 'existing' ? option.tag.name : `create-${option.name}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === activeIndex}
            className={cx(styles.option, option.kind === 'create' && styles.createOption)}
            // Garde le focus dans l'input : le choix se fait au clic sans le perdre.
            onMouseDown={(event) => {
              event.preventDefault()
            }}
            onClick={() => {
              choose(option)
            }}
          >
            {option.kind === 'existing' ? (
              <>
                <span className={styles.optionName}>{option.tag.name}</span>
                <span className={styles.optionMeta}>
                  {plural(option.tag.contextCount, 'contexte', 'contextes')}
                </span>
              </>
            ) : (
              <>
                <Icon name="plus" size={14} />
                <span>
                  Créer le tag <span className={styles.optionName}>« {option.name} »</span>
                </span>
              </>
            )}
          </div>
        ))}
        <p className={styles.optionHint} aria-hidden="true">
          ↑↓ naviguer · Entrée valider · Échap fermer
        </p>
      </div>
    </div>
  )
}
