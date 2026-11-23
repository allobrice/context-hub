import { isValidSlug } from '@context-hub/domain/context/slug.ts'
import { resourceUri } from '@context-hub/domain/context/uri.ts'
import type { ContextNotFoundError } from '@context-hub/domain/shared/errors.ts'
import { paths } from '../../app/paths.ts'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import styles from './Detail.module.scss'

/** Chargement du Détail (maquette 10). Décoratif : la page porte aria-busy. */
export function DetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={styles.skeletonHeader}>
        <Skeleton width={240} height={10} />
        <Skeleton width={480} height={20} />
        <Skeleton width={360} height={12} />
        <div className={styles.skeletonBadges}>
          <Skeleton width={64} height={20} />
          <Skeleton width={40} height={20} />
          <Skeleton width={120} height={20} />
        </div>
      </div>
      <div className={styles.body}>
        <div className={styles.skeletonMain}>
          <Skeleton width="50%" height={24} />
          <Skeleton width="92%" height={12} />
          <Skeleton width="86%" height={12} />
          <Skeleton width="70%" height={12} />
          <Skeleton height={96} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="64%" height={12} />
        </div>
        <div className={styles.aside}>
          <div className={styles.skeletonPanel} />
          <div className={styles.skeletonPanel} />
        </div>
      </div>
    </div>
  )
}

export interface ContextNotFoundProps {
  error: ContextNotFoundError
  onRetry: () => void
}

/** 404 (maquette 11) : l'URI demandée, les causes probables et une sortie. */
export function ContextNotFound({ error, onRetry }: ContextNotFoundProps) {
  const reference = isValidSlug(error.reference)
    ? resourceUri({ slug: error.reference })
    : error.reference
  const diagnostic = ['404', error.code, error.requestId && `req ${error.requestId}`]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className={styles.notFound}>
      <title>Contexte introuvable · Context Hub</title>
      <EmptyState
        icon="alertTriangle"
        tone="danger"
        title="Contexte introuvable"
        footer={diagnostic}
        actions={
          <>
            <ButtonLink to={paths.library}>Retour à la bibliothèque</ButtonLink>
            <Button icon="refresh" onClick={onRetry}>
              Réessayer
            </Button>
          </>
        }
      >
        Aucun contexte ne correspond à <span className={styles.mono}>{reference}</span>. Il a
        peut-être été renommé, supprimé, ou sa portée ne vous est pas accessible.
      </EmptyState>
    </div>
  )
}
