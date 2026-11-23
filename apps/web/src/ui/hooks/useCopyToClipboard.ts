import { useCallback, useEffect, useRef, useState } from 'react'

export type CopyStatus = 'idle' | 'copied' | 'error'

/** Durée d'affichage de « Copié » (SPEC §5.2). */
export const COPY_FEEDBACK_MS = 2000

/** Copie dans le presse-papiers et expose un statut qui revient à `idle` après `resetAfterMs`. */
export function useCopyToClipboard(resetAfterMs: number = COPY_FEEDBACK_MS) {
  const [status, setStatus] = useState<CopyStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const copy = useCallback(
    async (text: string) => {
      clearTimeout(timer.current)
      try {
        await navigator.clipboard.writeText(text)
        setStatus('copied')
      } catch {
        setStatus('error')
      }
      timer.current = setTimeout(() => {
        setStatus('idle')
      }, resetAfterMs)
    },
    [resetAfterMs],
  )

  return { status, copy }
}
