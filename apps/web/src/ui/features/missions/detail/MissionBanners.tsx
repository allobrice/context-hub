import type { Mission } from '@context-hub/domain/missions/types.ts'

import { useServices } from '../../../app/providers/servicesContext.ts'
import { Icon } from '../../../components/Icon/Icon.tsx'
import { cx } from '../../../lib/cx.ts'
import { formatRelativeDate } from '../../../lib/format.ts'
import { scopeLabel } from '../shared/missionPresentation.ts'
import { freshnessWarning } from './missionDetailPresentation.ts'
import styles from './MissionDetail.module.scss'

/** Bandeaux warn : « Validation requise » (maquette 34) et fraîcheur du code (maquette 36). */
export function MissionBanners({ mission }: { mission: Mission }) {
  const open =
    mission.status === 'draft' || mission.status === 'ready' || mission.status === 'in_progress'
  const freshness = open ? freshnessWarning(mission) : null
  if (mission.status !== 'draft' && freshness === null) return null
  return (
    <div className={styles.banners}>
      {mission.status === 'draft' && <ValidationBanner mission={mission} />}
      {freshness !== null && mission.freshness !== null && (
        <FreshnessBanner
          mission={mission}
          changed={freshness.changed}
          total={freshness.total}
          checkedAt={freshness.checkedAt}
          checkedBy={mission.freshness.checkedBy.sessionLabel}
        />
      )}
    </div>
  )
}

function ValidationBanner({ mission }: { mission: Mission }) {
  const author = mission.origin.session === null ? 'un humain' : 'une session'
  return (
    <div role="status" className={styles.banner}>
      <Icon name="shieldAlert" />
      <span className={styles.grow}>
        <strong>Validation requise.</strong> Cette mission a été écrite par {author} et sera
        exécutée par d’autres, en {scopeLabel(mission.scope).toLowerCase()}. Relisez le prompt :
        c’est une instruction qui sera suivie, pas une simple donnée.
      </span>
    </div>
  )
}

interface FreshnessBannerProps {
  mission: Mission
  changed: number
  total: number
  checkedAt: string
  checkedBy: string
}

function FreshnessBanner({ mission, changed, total, checkedAt, checkedBy }: FreshnessBannerProps) {
  const { clock } = useServices()
  const verb = changed <= 1 ? 'a été modifié' : 'ont été modifiés'
  const who =
    mission.status === 'in_progress'
      ? 'La session qui la traite doit revérifier le constat avant d’agir.'
      : 'La session qui prendra la mission revérifiera le constat avant d’agir.'
  return (
    <div role="alert" className={cx(styles.banner, styles.bannerStrong)}>
      <Icon name="alertTriangle" />
      <span className={styles.grow}>
        <strong>Le code a changé depuis la création.</strong> {changed} des {total} fichiers cités{' '}
        {verb} après <span className={styles.mono}>{mission.codeRef.commit}</span>. {who}{' '}
        <span className={styles.bannerNote}>
          Dernier contrôle : <span className={styles.mono}>{checkedBy}</span>,{' '}
          {formatRelativeDate(checkedAt, clock.now())}.
        </span>
      </span>
    </div>
  )
}
