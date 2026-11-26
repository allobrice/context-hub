import { useState } from 'react'
import { useParams } from 'react-router'

import { MissionNotFoundError } from '@context-hub/domain/missions/errors.ts'
import type { MissionDetail } from '@context-hub/domain/missions/types.ts'

import { LoadErrorState } from '../../../components/LoadErrorState/LoadErrorState.tsx'
import { useMission, useMissionAction } from '../shared/useMissions.ts'
import { MissionActionDialogs, type MissionDialog } from './MissionActionDialogs.tsx'
import { MissionAside } from './MissionAside.tsx'
import { MissionBanners } from './MissionBanners.tsx'
import { MissionHeader } from './MissionHeader.tsx'
import { MissionMain } from './MissionMain.tsx'
import { MissionNotFound, MissionSkeleton } from './MissionStates.tsx'
import styles from './MissionDetail.module.scss'

/** Détail d'une mission (SPEC §8.4, maquettes 34–39). */
export function MissionDetailPage() {
  const { slug = '' } = useParams()
  const query = useMission(slug)

  // Une mission déjà affichée le reste si son rechargement échoue : après « Rejeter », elle est
  // supprimée (404 au rechargement) et la vue doit rester montée pour revenir à la file.
  if (query.data !== undefined) return <MissionView key={slug} detail={query.data} />
  if (query.isPending) return <MissionSkeleton />
  if (query.error instanceof MissionNotFoundError) return <MissionNotFound slug={slug} />
  return (
    <div className={styles.statePage}>
      <LoadErrorState
        error={query.error}
        title="Impossible de charger la mission"
        onRetry={() => void query.refetch()}
      >
        Le serveur Context Hub n’a pas répondu.
      </LoadErrorState>
    </div>
  )
}

function MissionView({ detail }: { detail: MissionDetail }) {
  const { mission } = detail
  const action = useMissionAction(mission.slug, mission.updatedAt)
  const [dialog, setDialog] = useState<MissionDialog | null>(null)
  const close = () => {
    setDialog(null)
  }

  return (
    <>
      <title>{`${mission.title} · Missions · Context Hub`}</title>
      <MissionHeader
        detail={detail}
        action={action}
        dialogOpen={dialog !== null}
        onRequest={setDialog}
      />
      <MissionBanners mission={mission} />
      <div className={styles.body}>
        <MissionMain detail={detail} />
        <MissionAside
          detail={detail}
          onRelease={() => {
            action.reset()
            setDialog('release')
          }}
        />
      </div>
      <MissionActionDialogs dialog={dialog} mission={mission} action={action} onClose={close} />
    </>
  )
}
