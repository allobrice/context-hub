import { Link } from 'react-router'

import type { MissionSummary } from '@context-hub/domain/missions/types.ts'

import { paths } from '../../../app/paths.ts'
import { useServices } from '../../../app/providers/servicesContext.ts'
import { Skeleton } from '../../../components/Skeleton/Skeleton.tsx'
import { Tag } from '../../../components/Tag/Tag.tsx'
import { cx } from '../../../lib/cx.ts'
import { MissionStatusBadge, PriorityBadge } from '../shared/MissionBadges.tsx'
import { codeRefState, deadlineLabel, statusSubline } from '../shared/missionPresentation.ts'
import styles from './MissionsPage.module.scss'

function HeadRow() {
  return (
    <div role="rowgroup">
      <div role="row" className={cx(styles.row, styles.headRow)}>
        <span role="columnheader">Prio</span>
        <span role="columnheader">Mission</span>
        <span role="columnheader">Tags</span>
        <span role="columnheader">Code d’origine</span>
        <span role="columnheader">Statut</span>
        <span role="columnheader">Échéance</span>
      </div>
    </div>
  )
}

/** File des missions (maquette 31) : triée par le serveur, priorité puis ancienneté. */
export function MissionTable({ items }: { items: readonly MissionSummary[] }) {
  const { clock } = useServices()
  const now = clock.now()
  return (
    <div className={styles.tableWrap}>
      <div role="table" aria-label="Missions" className={styles.table}>
        <HeadRow />
        <div role="rowgroup">
          {items.map((mission) => {
            const code = codeRefState(mission)
            return (
              <div role="row" key={mission.id} className={cx(styles.row, styles.bodyRow)}>
                <span role="cell">
                  <PriorityBadge priority={mission.priority} />
                </span>
                <span role="cell" className={styles.titleCell}>
                  {/* Le lien couvre toute la ligne (::after) : la ligne entière est cliquable. */}
                  <Link to={paths.mission(mission.slug)} className={styles.rowLink}>
                    {mission.title}
                  </Link>
                  <span className={styles.summary}>{mission.summary}</span>
                </span>
                <span role="cell" className={styles.tags}>
                  {mission.tags.map((tag) => (
                    <Tag key={tag} name={tag} />
                  ))}
                </span>
                <span
                  role="cell"
                  className={cx(styles.codeRef, code.tone === 'ok' ? styles.ok : styles.warn)}
                >
                  <span className={styles.dot} aria-hidden="true" />
                  {code.label}
                </span>
                <span role="cell" className={styles.statusCell}>
                  <span>
                    <MissionStatusBadge status={mission.status} />
                  </span>
                  <span className={styles.subline}>{statusSubline(mission, now)}</span>
                </span>
                <span role="cell" className={styles.deadline}>
                  {deadlineLabel(mission, now)}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function MissionTableSkeleton() {
  return (
    <div className={styles.tableWrap} aria-busy="true" aria-label="Chargement des missions">
      <div className={styles.table}>
        <div className={cx(styles.row, styles.headRow)} aria-hidden="true">
          <Skeleton width={24} height={10} />
          <Skeleton width={70} height={10} />
        </div>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={cx(styles.row, styles.bodyRow)} aria-hidden="true">
            <Skeleton width={26} height={20} />
            <span className={styles.titleCell}>
              <Skeleton width="55%" height={12} />
              <Skeleton width="80%" height={10} />
            </span>
            <Skeleton width={90} height={18} />
            <Skeleton width={110} height={12} />
            <span className={styles.statusCell}>
              <Skeleton width={64} height={20} />
              <Skeleton width={130} height={10} />
            </span>
            <Skeleton width={90} height={12} />
          </div>
        ))}
      </div>
    </div>
  )
}
