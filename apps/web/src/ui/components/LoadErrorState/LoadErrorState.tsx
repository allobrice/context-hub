import type { ReactNode } from 'react'

import { isUnauthorized } from '../../../application/errors.ts'
import { technicalCode, UNAUTHORIZED_MESSAGE, UNAUTHORIZED_TITLE } from '../../lib/errors.ts'
import { ErrorState } from '../ErrorState/ErrorState.tsx'

export interface LoadErrorStateProps {
  readonly error: unknown
  readonly title: string
  /** Message de l'écran pour une panne de stockage. */
  readonly children?: ReactNode
  readonly onRetry: () => void
}

/**
 * Échec de la requête principale d'un écran. Un 401 a son message dédié et pas de « Réessayer » :
 * réessayer avec le même jeton échouerait de la même façon.
 */
export function LoadErrorState({ error, title, children, onRetry }: LoadErrorStateProps) {
  if (isUnauthorized(error))
    return <ErrorState title={UNAUTHORIZED_TITLE}>{UNAUTHORIZED_MESSAGE}</ErrorState>
  return (
    <ErrorState title={title} code={technicalCode(error)} onRetry={onRetry}>
      {children}
    </ErrorState>
  )
}
