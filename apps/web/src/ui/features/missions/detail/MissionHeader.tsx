import { Link } from 'react-router'

import type { Mission, MissionDetail } from '@context-hub/domain/missions/types.ts'

import { paths } from '../../../app/paths.ts'
import { useServices } from '../../../app/providers/servicesContext.ts'
import { Button } from '../../../components/Button/Button.tsx'
import { ButtonLink } from '../../../components/Button/ButtonLink.tsx'
import { Tag } from '../../../components/Tag/Tag.tsx'
import { failureOf } from '../../../lib/errors.ts'
import { LifecycleTimeline } from '../shared/LifecycleTimeline.tsx'
import { MissionStatusBadge, PriorityBadge } from '../shared/MissionBadges.tsx'
import { deadlineLabel, lifecycleSteps, scopeLabel } from '../shared/missionPresentation.ts'
import type { MissionActionMutation, MissionDialog } from './MissionActionDialogs.tsx'
import { userNameOf } from './missionDetailPresentation.ts'
import { missionProposal } from './missionProposal.ts'
import styles from './MissionDetail.module.scss'

export interface MissionHeaderProps {
  detail: MissionDetail
  action: MissionActionMutation
  /** Un dialog est ouvert : l'échec d'une action s'y affiche, pas dans l'en-tête. */
  dialogOpen: boolean
  onRequest: (dialog: MissionDialog) => void
}

/** En-tête (maquettes 34–38) : fil d'Ariane, priorité, titre, statut, méta, actions et frise. */
export function MissionHeader({ detail, action, dialogOpen, onRequest }: MissionHeaderProps) {
  const { clock } = useServices()
  const now = clock.now()
  const { mission, events } = detail
  const failure = dialogOpen ? null : failureOf(action.error)

  return (
    <header className={styles.header}>
      <nav aria-label="Fil d’Ariane" className={styles.breadcrumb}>
        <Link to={paths.missions()}>Missions</Link>
        <span aria-hidden="true">/</span>
        <span className={styles.crumbSlug}>{mission.slug}</span>
      </nav>
      <div className={styles.headerMain}>
        <div className={styles.headerText}>
          <div className={styles.titleLine}>
            <PriorityBadge priority={mission.priority} />
            <h1 className={styles.title}>{mission.title}</h1>
          </div>
          <div className={styles.meta}>
            <MissionStatusBadge status={mission.status} />
            {mission.tags.map((tag) => (
              <Tag key={tag} name={tag} />
            ))}
            <span>{mission.codeRef.repo}</span>
            <span aria-hidden="true">·</span>
            <span>{scopeLabel(mission.scope)}</span>
            <span aria-hidden="true">·</span>
            <span>{deadlineLabel(mission, now)}</span>
          </div>
        </div>
        <HeaderActions mission={mission} action={action} onRequest={onRequest} />
      </div>
      {failure !== null && (
        <p role="alert" className={styles.inlineError}>
          {failure}
        </p>
      )}
      <LifecycleTimeline
        steps={lifecycleSteps(mission, events, now, (userId) =>
          userNameOf(userId, mission, events),
        )}
      />
    </header>
  )
}

function HeaderActions({
  mission,
  action,
  onRequest,
}: {
  mission: Mission
  action: MissionActionMutation
  onRequest: (dialog: MissionDialog) => void
}) {
  const request = (dialog: MissionDialog) => () => {
    action.reset()
    onRequest(dialog)
  }
  const reopen = (
    <Button
      disabled={action.isPending}
      onClick={() => {
        action.mutate({ kind: 'reopen' })
      }}
    >
      Rouvrir
    </Button>
  )
  switch (mission.status) {
    case 'draft':
      return (
        <div className={styles.actions}>
          <Button onClick={request('reject')}>Rejeter…</Button>
          <Button onClick={request('edit')}>Modifier</Button>
          <Button
            variant="primary"

            disabled={action.isPending}
            onClick={() => {
              action.mutate({ kind: 'validate' })
            }}
          >
            Valider la mission
          </Button>
        </div>
      )
    case 'ready':
      return (
        <div className={styles.actions}>
          <Button onClick={request('drop')}>Abandonner…</Button>
          <Button onClick={request('edit')}>Modifier</Button>
        </div>
      )
    case 'in_progress':
      return (
        <div className={styles.actions}>
          <Button onClick={request('release')}>Libérer</Button>
        </div>
      )
    case 'done':
      return (
        <div className={styles.actions}>
          {reopen}
          <ButtonLink to={paths.proposeContext(missionProposal(mission))}>
            Proposer comme contexte
          </ButtonLink>
        </div>
      )
    case 'dropped':
      return <div className={styles.actions}>{reopen}</div>
    case 'expired':
      return null
  }
}
