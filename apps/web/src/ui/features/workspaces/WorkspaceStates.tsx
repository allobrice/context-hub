import { paths } from '../../app/paths.ts'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import styles from './Workspace.module.scss'

const backToList = <ButtonLink to={paths.workspaces()}>Retour aux workspaces</ButtonLink>

/** Maquette 30 : l'utilisateur n'est pas membre du workspace. */
export function WorkspaceForbidden({ slug }: { slug: string }) {
  return (
    <div className={styles.statePage}>
      <title>Accès refusé · Context Hub</title>
      <EmptyState
        icon="lock"
        tone="danger"
        title="Accès refusé à ce workspace"
        actions={backToList}
        footer={<code>403 · WORKSPACE_FORBIDDEN</code>}
      >
        Vous ne participez pas à <span className={styles.mono}>{slug}</span>. Demandez à son
        créateur de vous inviter : le journal peut contenir des informations sur du code en cours.
      </EmptyState>
    </div>
  )
}

export function WorkspaceNotFound({ slug }: { slug: string }) {
  return (
    <div className={styles.statePage}>
      <title>Workspace introuvable · Context Hub</title>
      <EmptyState
        icon="workspace"
        tone="danger"
        title="Workspace introuvable"
        actions={backToList}
        footer={<code>404 · {slug}</code>}
      >
        Aucun workspace ne porte le slug <span className={styles.mono}>{slug}</span>. Il a peut-être
        été renommé, ou le lien est incomplet.
      </EmptyState>
    </div>
  )
}

/** Maquette 29 : en-tête, journal et colonne de droite en squelette. */
export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du workspace">
      <div className={styles.header} aria-hidden="true">
        <Skeleton width={160} height={10} />
        <Skeleton width={420} height={20} />
        <Skeleton width="60%" height={12} />
        <Skeleton width={320} height={12} />
      </div>
      <div className={styles.body} aria-hidden="true">
        <div className={styles.journal}>
          <Skeleton width="50%" height={28} />
          <Skeleton height={84} />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} height={76} />
          ))}
        </div>
        <div className={styles.aside}>
          <Skeleton height={120} />
          <Skeleton height={180} />
          <Skeleton height={120} />
        </div>
      </div>
    </div>
  )
}
