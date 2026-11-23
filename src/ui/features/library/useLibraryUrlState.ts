import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import {
  parseLibraryParams,
  patchLibraryState,
  writeLibraryParams,
  type LibraryUrlState,
} from './libraryParams.ts'

export type UpdateLibraryState = (
  patch: Partial<LibraryUrlState>,
  options?: { replace?: boolean },
) => void

/** État de la Bibliothèque lu et écrit dans l'URL (source de vérité unique). */
export function useLibraryUrlState(): [LibraryUrlState, UpdateLibraryState] {
  const [params, setParams] = useSearchParams()
  const state = useMemo(() => parseLibraryParams(params), [params])

  const update = useCallback<UpdateLibraryState>(
    (patch, options) => {
      setParams(
        (current) =>
          writeLibraryParams(patchLibraryState(parseLibraryParams(current), patch), current),
        {
          replace: options?.replace ?? false,
        },
      )
    },
    [setParams],
  )

  return [state, update]
}
