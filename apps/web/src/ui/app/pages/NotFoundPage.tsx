import { useLocation } from 'react-router'

import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { paths } from '../paths.ts'
import styles from './PageStatus.module.scss'

export function NotFoundPage() {
  const { pathname } = useLocation()
  return (
    <div className={styles.page}>
      <title>Page introuvable · Context Hub</title>
      <EmptyState
        icon="search"
        title="Page introuvable"
        actions={<ButtonLink to={paths.library}>Retour à la bibliothèque</ButtonLink>}
      >
        Aucune page ne correspond à <span className={styles.mono}>{pathname}</span>.
      </EmptyState>
    </div>
  )
}
