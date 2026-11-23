import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { paths } from '../paths.ts'
import styles from './PageStatus.module.scss'

/** Écran pas encore implémenté (phases 4 à 6). Remplacé écran par écran. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div className={styles.page}>
      <title>{`${title} · Context Hub`}</title>
      <EmptyState
        icon="clock"
        title={title}
        actions={<ButtonLink to={paths.library}>Retour à la bibliothèque</ButtonLink>}
      >
        Cet écran arrive dans une prochaine étape.
      </EmptyState>
    </div>
  )
}
