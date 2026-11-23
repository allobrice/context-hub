import { useRouteError } from 'react-router'

import { ErrorState } from '../../components/ErrorState/ErrorState.tsx'
import styles from './PageStatus.module.scss'

/** Erreur inattendue d'une route (exception de rendu, module lazy introuvable…). */
export function RouteErrorPage() {
  const error = useRouteError()
  return (
    <div className={styles.page}>
      <title>Erreur · Context Hub</title>
      <ErrorState
        title="Cet écran n’a pas pu s’afficher"
        code={error instanceof Error ? error.message : undefined}
        onRetry={() => {
          window.location.reload()
        }}
      >
        Rechargez la page. Si le problème persiste, signalez-le avec le code ci-dessous.
      </ErrorState>
    </div>
  )
}
