import { useRef, useState } from 'react'

import { Icon } from '../../components/Icon/Icon.tsx'
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback.ts'
import { modifierHotkeyLabel, useModifierHotkey } from '../../hooks/useHotkey.ts'
import styles from './SearchField.module.scss'

export const SEARCH_DEBOUNCE_MS = 250

export interface SearchFieldProps {
  /** Valeur appliquée (URL). */
  value: string
  /** Appelé après la pause de frappe, ou immédiatement sur Entrée. */
  onCommit: (value: string) => void
}

/**
 * Recherche plein texte debouncée, focalisable par ⌘K / Ctrl+K. La saisie reste locale pendant la
 * frappe ; une valeur appliquée ailleurs (« Effacer la recherche », historique) remplace la saisie.
 */
export function SearchField({ value, onCommit }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  const [lastCommitted, setLastCommitted] = useState(value)
  const commit = useDebouncedCallback((next: string) => {
    setLastCommitted(next)
    onCommit(next)
  }, SEARCH_DEBOUNCE_MS)

  // Valeur changée hors de ce champ : on l'adopte (ajustement d'état pendant le rendu, sans effet).
  if (value !== lastValue) {
    setLastValue(value)
    if (value !== lastCommitted) {
      commit.cancel()
      setDraft(value)
      setLastCommitted(value)
    }
  }

  useModifierHotkey('k', () => {
    inputRef.current?.focus()
    inputRef.current?.select()
  })

  return (
    <label className={styles.search}>
      <span className="visually-hidden">Rechercher dans les contextes</span>
      <Icon name="search" className={styles.icon} />
      <input
        ref={inputRef}
        type="search"
        className={styles.input}
        placeholder="Rechercher titre, contenu, tag…"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          commit.run(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit.cancel()
            setLastCommitted(draft)
            onCommit(draft)
          }
        }}
        aria-keyshortcuts="Meta+K Control+K"
      />
      <kbd className={styles.kbd} aria-hidden="true">
        {modifierHotkeyLabel('k')}
      </kbd>
    </label>
  )
}
