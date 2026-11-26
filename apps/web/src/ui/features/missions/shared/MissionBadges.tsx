import type { MissionStatus, Priority } from '@context-hub/domain/missions/types.ts'

import { Badge } from '../../../components/Badge/Badge.tsx'
import { cx } from '../../../lib/cx.ts'
import { MISSION_STATUS_LABELS, MISSION_STATUS_TONES, priorityTone } from './missionPresentation.ts'
import styles from './MissionShared.module.scss'

/** Priorité en monospace, P1 en danger (maquette 31). */
export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cx(styles.priority, priorityTone(priority) === 'danger' && styles.priorityHigh)}
      title={`Priorité ${priority}`}
    >
      {priority}
    </span>
  )
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return (
    <Badge tone={MISSION_STATUS_TONES[status]} dot>
      {MISSION_STATUS_LABELS[status]}
    </Badge>
  )
}
