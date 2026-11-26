import type { MissionBatch, MissionStatus } from '@context-hub/domain/missions/types.ts'

import { Skeleton } from '../../../components/Skeleton/Skeleton.tsx'
import { cx } from '../../../lib/cx.ts'
import { plural } from '../../../lib/format.ts'
import { batchSegments } from '../shared/missionPresentation.ts'
import { useMissionBatch } from '../shared/useMissions.ts'
import styles from './MissionsPage.module.scss'

/** Couleur de chaque statut dans la barre d'avancement (maquette 31). */
const SEGMENT_CLASSES: Readonly<Record<MissionStatus, string | undefined>> = {
  done: styles.segmentDone,
  in_progress: styles.segmentInProgress,
  ready: styles.segmentReady,
  draft: styles.segmentDraft,
  dropped: styles.segmentClosed,
  expired: styles.segmentClosed,
}

const createdAtFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

/** « 25 nov., 14:02 » (maquette 31). */
function formatCreatedAt(iso: string): string {
  return createdAtFormat.format(new Date(iso))
}

/** Bloc « Origine » : affiché seulement quand la file est filtrée sur un lot (SPEC §8.4). */
export function MissionOrigin({ batchId }: { batchId: string }) {
  const query = useMissionBatch(batchId)
  return (
    <div className={styles.originWrap}>
      {query.isPending && (
        <div
          className={cx(styles.origin, styles.originLoading)}
          aria-busy="true"
          aria-label="Chargement de l’origine des missions"
        >
          <Skeleton width={260} height={14} />
          <Skeleton width={360} height={8} />
        </div>
      )}
      {query.data && <OriginPanel batch={query.data} />}
    </div>
  )
}

function OriginPanel({ batch }: { batch: MissionBatch }) {
  const segments = batchSegments(batch.counts)
  const summary = `${plural(batch.total, 'mission', 'missions')} : ${segments
    .map((segment) => segment.label)
    .join(', ')}`
  return (
    <section className={styles.origin} aria-label="Origine des missions">
      <div className={styles.originText}>
        <span className={styles.originEyebrow}>Origine</span>
        <span className={styles.originLabel}>{batch.label}</span>
        <span className={styles.originMeta}>
          {batch.session && (
            <>
              Session <span className={styles.mono}>{batch.session.sessionLabel}</span> (
              {batch.session.userName}) ·{' '}
            </>
          )}
          {batch.repo} @ <span className={styles.mono}>{batch.commit}</span> ·{' '}
          {formatCreatedAt(batch.createdAt)}
        </span>
      </div>
      <div className={styles.progress}>
        <div className={styles.progressBar} role="img" aria-label={summary}>
          {segments.map((segment) => (
            <span
              key={segment.status}
              className={SEGMENT_CLASSES[segment.status]}
              style={{ width: `${String((segment.count / batch.total) * 100)}%` }}
            />
          ))}
        </div>
        <ul className={styles.legend} aria-hidden="true">
          {segments.map((segment) => (
            <li key={segment.status} className={styles.legendItem}>
              <span className={cx(styles.legendDot, SEGMENT_CLASSES[segment.status])} />
              {segment.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
