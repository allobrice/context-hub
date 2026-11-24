import { useParams, useSearchParams } from 'react-router'

import { ContextNotFoundError } from '@context-hub/domain/shared/errors.ts'
import { useWorkspaceOverview } from '../../app/queries.ts'
import { LoadErrorState } from '../../components/LoadErrorState/LoadErrorState.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { ContextNotFound } from '../context-detail/DetailStates.tsx'
import { useContextDetail } from '../context-detail/useContextDetail.ts'
import { ContextEditor } from './ContextEditor.tsx'
import styles from './Editor.module.scss'
import { newEditorState, stateFromDetail } from './editorForm.ts'
import { useTagSuggestions } from './useEditorPersistence.ts'

function EditorSkeleton() {
  return (
    <div
      className={styles.skeleton}
      role="region"
      aria-label="Chargement de l’éditeur"
      aria-busy="true"
    >
      <Skeleton width={320} height={20} />
      <Skeleton height={32} />
      <Skeleton height={32} />
      <Skeleton height={440} />
    </div>
  )
}

/** Création (`/contexts/new`) et édition (`/contexts/:id/edit`). */
export function EditorPage() {
  const { id } = useParams()
  return id === undefined ? <NewContextEditor /> : <ExistingContextEditor reference={id} />
}

function NewContextEditor() {
  const [params] = useSearchParams()
  const overview = useWorkspaceOverview().data
  const tags = useTagSuggestions().data ?? []
  if (!overview) return <EditorSkeleton />
  return (
    <ContextEditor
      detail={null}
      initialState={newEditorState(overview.currentUser.name, params.get('title') ?? '', {
        description: params.get('description') ?? '',
        content: params.get('content') ?? '',
      })}
      collections={overview.collections}
      tags={tags}
      currentUser={overview.currentUser.name}
    />
  )
}

function ExistingContextEditor({ reference }: { reference: string }) {
  const query = useContextDetail(reference)
  const overview = useWorkspaceOverview().data
  const tags = useTagSuggestions().data ?? []

  if (query.isError) {
    const { error } = query
    if (error instanceof ContextNotFoundError) {
      return <ContextNotFound error={error} onRetry={() => void query.refetch()} />
    }
    return (
      <div className={styles.skeleton}>
        <LoadErrorState
          error={error}
          title="Impossible de charger le contexte"
          onRetry={() => void query.refetch()}
        />
      </div>
    )
  }
  if (!query.data || !overview) return <EditorSkeleton />

  return (
    <ContextEditor
      key={query.data.context.id}
      detail={query.data}
      initialState={stateFromDetail(query.data)}
      collections={overview.collections}
      tags={tags}
      currentUser={overview.currentUser.name}
    />
  )
}
