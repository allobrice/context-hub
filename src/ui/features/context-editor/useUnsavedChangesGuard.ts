import { useCallback, useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

/**
 * Garde de navigation (SPEC §5.3) : bloque la navigation interne et l'onglet tant que `dirty`.
 * `allowNextNavigation()` laisse passer la navigation programmée après un enregistrement réussi.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const allowed = useRef(false)
  const dirtyRef = useRef(dirty)

  useEffect(() => {
    dirtyRef.current = dirty
  }, [dirty])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current && !allowed.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [dirty])

  const allowNextNavigation = useCallback(() => {
    allowed.current = true
  }, [])

  return { blocker, allowNextNavigation }
}
