import { useCallback, useEffect, useMemo, useRef } from 'react'

export interface DebouncedCallback<A extends unknown[]> {
  run: (...args: A) => void
  /** Abandonne l'appel en attente (ex. quand la valeur est remise à zéro ailleurs). */
  cancel: () => void
}

/** Retarde `callback` jusqu'à `delayMs` sans nouvel appel. La dernière version de `callback` est toujours utilisée. */
export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): DebouncedCallback<A> {
  const latest = useRef(callback)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    latest.current = callback
  }, [callback])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const cancel = useCallback(() => {
    clearTimeout(timer.current)
  }, [])

  const run = useCallback(
    (...args: A) => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        latest.current(...args)
      }, delayMs)
    },
    [delayMs],
  )

  return useMemo(() => ({ run, cancel }), [run, cancel])
}
