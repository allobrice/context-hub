import { useEffect, useRef } from 'react'

/** Raccourci ⌘/Ctrl + touche, global au document. */
export function useModifierHotkey(key: string, handler: () => void): void {
  const latest = useRef(handler)

  useEffect(() => {
    latest.current = handler
  }, [handler])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === key) {
        event.preventDefault()
        latest.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [key])
}

/** Libellé du raccourci selon la plateforme : « ⌘K » sur macOS, « Ctrl K » ailleurs. */
export function modifierHotkeyLabel(key: string): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent)
  return isMac ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`
}
