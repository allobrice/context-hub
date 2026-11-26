import { paths } from '../../../app/paths.ts'
import { ButtonLink } from '../../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../../components/EmptyState/EmptyState.tsx'
import { Skeleton } from '../../../components/Skeleton/Skeleton.tsx'
import styles from './MissionDetail.module.scss'

/** Slug inconnu, ou mission rejetée (supprimée) entre-temps. */
export function MissionNotFound({ slug }: { slug: string }) {
  return (
    <div className={styles.statePage}>
      <title>Mission introuvable · Context Hub</title>
      <EmptyState
        icon="mission"
        tone="danger"
        title="Mission introuvable"
        actions={<ButtonLink to={paths.missions()}>Retour à la file</ButtonLink>}
        footer={<code>404 · {slug}</code>}
      >
        Aucune mission ne porte le slug <span className={styles.mono}>{slug}</span>. Elle a
        peut-être été rejetée, ou le lien est incomplet.
      </EmptyState>
    </div>
  )
}

/** En-tête, frise, prompt et colonne de droite en squelette. */
export function MissionSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement de la mission">
      <div className={styles.header} aria-hidden="true">
        <Skeleton width={180} height={10} />
        <Skeleton width={420} height={20} />
        <Skeleton width="50%" height={12} />
        <Skeleton height={24} />
      </div>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.main}>
          <Skeleton height={360} />
          <Skeleton height={96} />
        </div>
        <div className={styles.aside}>
          <Skeleton height={140} />
          <Skeleton height={150} />
          <Skeleton height={120} />
        </div>
      </div>
    </div>
  )
}
