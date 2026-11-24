import { useParams } from 'react-router'

import {
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
} from '@context-hub/domain/shared/errors.ts'
import type { WorkspaceDetail } from '@context-hub/domain/workspaces/types.ts'
import { LoadErrorState } from '../../components/LoadErrorState/LoadErrorState.tsx'
import { Journal } from './Journal.tsx'
import { WorkspaceAside } from './WorkspaceAside.tsx'
import { WorkspaceHeader } from './WorkspaceHeader.tsx'
import { WorkspaceForbidden, WorkspaceNotFound, WorkspaceSkeleton } from './WorkspaceStates.tsx'
import { useJournal, useWorkspace } from './useWorkspaces.ts'
import styles from './Workspace.module.scss'

/** Détail d'un workspace (SPEC §7.4, maquettes 26–30). */
export function WorkspaceDetailPage() {
  const { slug = '' } = useParams()
  const query = useWorkspace(slug)

  if (query.isPending) return <WorkspaceSkeleton />
  if (query.isError) {
    if (query.error instanceof WorkspaceForbiddenError) return <WorkspaceForbidden slug={slug} />
    if (query.error instanceof WorkspaceNotFoundError) return <WorkspaceNotFound slug={slug} />
    return (
      <div className={styles.statePage}>
        <LoadErrorState
          error={query.error}
          title="Impossible de charger le workspace"
          onRetry={() => void query.refetch()}
        >
          Le serveur Context Hub n’a pas répondu.
        </LoadErrorState>
      </div>
    )
  }
  return <WorkspaceView key={slug} detail={query.data} />
}

function WorkspaceView({ detail }: { detail: WorkspaceDetail }) {
  const { workspace } = detail
  const open = workspace.status === 'open'
  const journal = useJournal(workspace.slug, open)
  return (
    <>
      <title>{`${workspace.title} · Workspaces · Context Hub`}</title>
      <WorkspaceHeader detail={detail} entries={journal.journal.data?.entries ?? []} />
      <div className={styles.body}>
        <Journal detail={detail} journal={journal} />
        <WorkspaceAside detail={detail} />
      </div>
    </>
  )
}
