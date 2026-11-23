import type { ContextStatus } from '@context-hub/domain/context/types.ts'
import { STATUS_LABELS } from '../../lib/labels.ts'
import { Badge, type BadgeTone } from '../Badge/Badge.tsx'

/** Mapping de design-kit/tokens/tokens.json (`status`). */
const STATUS_TONES: Readonly<Record<ContextStatus, BadgeTone>> = {
  published: 'ok',
  draft: 'warn',
  archived: 'neutral',
}

export function StatusBadge({ status }: { status: ContextStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
