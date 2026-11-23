import { useState } from 'react'
import { useParams } from 'react-router'

import type { ContextVersion } from '@context-hub/domain/context/types.ts'
import { resourceUri } from '@context-hub/domain/context/uri.ts'
import { ContextNotFoundError } from '@context-hub/domain/shared/errors.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { LoadErrorState } from '../../components/LoadErrorState/LoadErrorState.tsx'
import { useCopyToClipboard } from '../../hooks/useCopyToClipboard.ts'
import { ContentPanel } from './ContentPanel.tsx'
import styles from './Detail.module.scss'
import { DetailHeader } from './DetailHeader.tsx'
import { ContextNotFound, DetailSkeleton } from './DetailStates.tsx'
import { HistoryPanel, MetadataPanel, UsePanel } from './SidePanels.tsx'
import { useContextDetail, useDetailAction } from './useContextDetail.ts'

const ACTION_FAILED = 'L’action a échoué. Réessayez dans un instant.'

type PendingConfirmation = { kind: 'archive' } | { kind: 'restore'; version: ContextVersion } | null

/** Détail d'un contexte (SPEC §5.2, maquettes 08–11). `:id` accepte un identifiant ou un slug. */
export function DetailPage() {
  const reference = useParams().id ?? ''
  const { clock } = useServices()
  const query = useContextDetail(reference)
  const detail = query.data
  const action = useDetailAction(reference, detail?.context.id)
  const [confirmation, setConfirmation] = useState<PendingConfirmation>(null)
  const [announcement, setAnnouncement] = useState('')
  const { copy } = useCopyToClipboard()
  const now = clock.now()

  if (query.isError) {
    const { error } = query
    if (error instanceof ContextNotFoundError) {
      return <ContextNotFound error={error} onRetry={() => void query.refetch()} />
    }
    return (
      <div className={styles.notFound}>
        <title>Erreur · Context Hub</title>
        <LoadErrorState
          error={error}
          title="Impossible de charger le contexte"
          onRetry={() => void query.refetch()}
        >
          Le stockage n’a pas répondu. Les sessions Claude Code déjà connectées continuent de servir
          la dernière version en cache.
        </LoadErrorState>
      </div>
    )
  }

  if (!detail) {
    return (
      <div aria-busy="true" aria-label="Chargement du contexte" role="region">
        <DetailSkeleton />
      </div>
    )
  }

  const { context } = detail
  const close = () => {
    setConfirmation(null)
  }

  function confirm() {
    if (!confirmation) return
    const run =
      confirmation.kind === 'archive'
        ? action.mutateAsync({ kind: 'archive' }).then(() => 'Contexte archivé.')
        : action
            .mutateAsync({ kind: 'restore', versionNumber: confirmation.version.number })
            .then(
              (next) =>
                `v${confirmation.version.number} restaurée dans le brouillon v${next.context.draft?.number ?? ''}.`,
            )
    void run.then(
      (message) => {
        setAnnouncement(message)
        close()
      },
      () => {
        setAnnouncement(ACTION_FAILED)
      },
    )
  }

  return (
    <>
      <title>{`${context.title} · Context Hub`}</title>
      <DetailHeader
        detail={detail}
        now={now}
        onArchive={() => {
          setConfirmation({ kind: 'archive' })
        }}
        onUnarchive={() => {
          void action.mutateAsync({ kind: 'unarchive' }).then(
            () => {
              setAnnouncement('Contexte désarchivé.')
            },
            () => {
              setAnnouncement(ACTION_FAILED)
            },
          )
        }}
        onCopyUri={() => {
          void copy(resourceUri(context)).then(() => {
            setAnnouncement('URI copiée dans le presse-papiers.')
          })
        }}
      />
      <div className={styles.body}>
        <ContentPanel context={context} />
        <aside className={styles.aside} aria-label="Utilisation et historique">
          <UsePanel detail={detail} />
          <MetadataPanel detail={detail} />
          <HistoryPanel
            detail={detail}
            now={now}
            onRestore={(version) => {
              setConfirmation({ kind: 'restore', version })
            }}
          />
        </aside>
      </div>
      <span role="status" className="visually-hidden">
        {announcement}
      </span>

      <ConfirmDialog
        open={confirmation?.kind === 'archive'}
        title="Archiver ce contexte ?"
        confirmLabel="Archiver"
        tone="danger"
        pending={action.isPending}
        onConfirm={confirm}
        onCancel={close}
      >
        <p>
          Les sessions Claude Code ne liront plus <strong>{context.title}</strong>. Les URI et
          l’historique sont conservés : vous pourrez le désarchiver.
        </p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmation?.kind === 'restore'}
        title={
          confirmation?.kind === 'restore' ? `Restaurer la v${confirmation.version.number} ?` : ''
        }
        confirmLabel="Restaurer dans le brouillon"
        pending={action.isPending}
        onConfirm={confirm}
        onCancel={close}
      >
        {confirmation?.kind === 'restore' && (
          <p>
            Le contenu de la v{confirmation.version.number} est copié dans le brouillon
            {context.draft ? ` et remplace le brouillon v${context.draft.number} en cours` : ''}.
            Rien n’est publié
            {context.publishedVersion
              ? ` : les sessions continuent de lire la v${context.publishedVersion.number}`
              : ''}
            .
          </p>
        )}
      </ConfirmDialog>
    </>
  )
}
