import { useId } from 'react'

import {
  MISSION_RESERVATION_MINUTES,
  type InProgressMission,
  type Mission,
  type MissionDetail,
} from '@context-hub/domain/missions/types.ts'

import { useServices } from '../../../app/providers/servicesContext.ts'
import { Button } from '../../../components/Button/Button.tsx'
import { CopyField } from '../../../components/CopyField/CopyField.tsx'
import { Icon } from '../../../components/Icon/Icon.tsx'
import { cx } from '../../../lib/cx.ts'
import { formatRelativeDate, formatShortDateTime } from '../../../lib/format.ts'
import { elapsedLabel, scopeLabel } from '../shared/missionPresentation.ts'
import {
  codeFileStates,
  formatDayMonth,
  historyItems,
  userNameOf,
} from './missionDetailPresentation.ts'
import styles from './MissionDetail.module.scss'

const MINUTE = 60_000

export interface MissionAsideProps {
  detail: MissionDetail
  onRelease: () => void
}

/** Colonne de droite (maquettes 34–38) : panneaux selon le statut, puis origine et historique. */
export function MissionAside({ detail, onRelease }: MissionAsideProps) {
  const { mission } = detail
  return (
    <aside className={styles.aside} aria-label="Prise, code d’origine et historique">
      {mission.status === 'ready' && <TakePanel mission={mission} />}
      {mission.status === 'in_progress' && <HoldPanel mission={mission} onRelease={onRelease} />}
      <CodePanel mission={mission} />
      <OriginPanel detail={detail} />
      <HistoryPanel detail={detail} />
    </aside>
  )
}

function TakePanel({ mission }: { mission: Mission }) {
  const headingId = useId()
  const firstTag = mission.tags[0]
  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, styles.padded)}>
      <div className={styles.panelTitleLine}>
        <Icon name="terminal" />
        <h2 id={headingId} className={styles.sectionTitle}>
          Prendre depuis Claude Code
        </h2>
      </div>
      <CopyField value={`/context-hub:take ${mission.slug}`} copyLabel="Copier la commande" />
      <span className={styles.small}>
        ou{' '}
        <span className={styles.mono}>
          {firstTag === undefined ? '/context-hub:next' : `/context-hub:next ${firstTag}`}
        </span>{' '}
        pour prendre la mission prête la plus prioritaire.
      </span>
      <ol className={styles.steps}>
        <li>La session réserve la mission. Aucune autre session ne peut la prendre.</li>
        <li>
          Elle vérifie que le code n’a pas changé depuis{' '}
          <span className={styles.mono}>{mission.codeRef.commit}</span>.
        </li>
        <li>
          Elle vous <strong>montre le prompt et demande votre accord</strong> avant d’agir.
        </li>
        <li>Elle traite la mission, puis enregistre le résultat.</li>
      </ol>
    </section>
  )
}

function HoldPanel({ mission, onRelease }: { mission: InProgressMission; onRelease: () => void }) {
  const { clock } = useServices()
  const now = clock.now()
  const headingId = useId()
  const { session, acquiredAt, expiresAt } = mission.claim
  const expiresMs = Date.parse(expiresAt)
  const lastActivity = new Date(expiresMs - MISSION_RESERVATION_MINUTES * MINUTE).toISOString()
  const minutesLeft = Math.max(0, Math.ceil((expiresMs - now.getTime()) / MINUTE))
  return (
    <section
      aria-labelledby={headingId}
      className={cx(styles.panel, styles.padded, styles.holdPanel)}
    >
      <h2 id={headingId} className={styles.sectionTitle}>
        Prise en charge
      </h2>
      <div className={styles.holder}>
        <span className={cx(styles.dot, styles.ok)} aria-hidden="true" />
        <span className={styles.holderSession}>{session.sessionLabel}</span>
        <span className={styles.small}>
          {session.repo === null ? session.userName : `${session.userName} · ${session.repo}`}
        </span>
      </div>
      <span className={styles.holdText}>
        Réservée depuis {elapsedLabel(acquiredAt, now)}, dernière activité{' '}
        {formatRelativeDate(lastActivity, now)}. La réservation est relâchée automatiquement après{' '}
        {MISSION_RESERVATION_MINUTES} min sans activité (dans {minutesLeft} min) : la mission
        redevient alors prête.
      </span>
      <Button size="sm" className={styles.alignStart} onClick={onRelease}>
        Libérer la mission
      </Button>
    </section>
  )
}

function CodePanel({ mission }: { mission: Mission }) {
  const { clock } = useServices()
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          Code d’origine
        </h2>
        <span className={styles.panelMeta}>{mission.codeRef.commit}</span>
      </div>
      <ul className={styles.list}>
        {codeFileStates(mission).map((file) => (
          <li key={file.path} className={styles.fileRow}>
            <code className={styles.filePath} title={file.path}>
              {file.path}
            </code>
            <span className={cx(styles.fileState, file.changed ? styles.warn : styles.ok)}>
              <span className={styles.dot} aria-hidden="true" />
              {file.changed ? 'modifié' : 'inchangé'}
            </span>
          </li>
        ))}
      </ul>
      <span className={styles.panelFoot}>
        {mission.freshness === null ? (
          'Contrôlé par la session au moment de la prise.'
        ) : (
          <>
            Dernier contrôle par{' '}
            <span className={styles.mono}>{mission.freshness.checkedBy.sessionLabel}</span>{' '}
            {formatRelativeDate(mission.freshness.checkedAt, clock.now())}, refait à chaque prise.
          </>
        )}
      </span>
    </section>
  )
}

function validationText(mission: Mission, name: (userId: string) => string) {
  if (mission.validation !== null) {
    return {
      tone: 'ok',
      text: `Validée par ${name(mission.validation.by)} le ${formatDayMonth(mission.validation.at)}`,
    } as const
  }
  if (mission.status === 'draft') {
    return {
      tone: 'warn',
      text: `En attente (${scopeLabel(mission.scope).toLowerCase()})`,
    } as const
  }
  return { tone: 'neutral', text: 'Non requise' } as const
}

function OriginPanel({ detail }: { detail: MissionDetail }) {
  const headingId = useId()
  const { mission } = detail
  const { origin } = mission
  const name = (userId: string) => userNameOf(userId, detail.userNames)
  const validation = validationText(mission, name)
  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, styles.padded)}>
      <h2 id={headingId} className={styles.sectionTitle}>
        Origine et sécurité
      </h2>
      <dl className={styles.facts}>
        <dt>Créée par</dt>
        <dd>
          {origin.session === null ? (
            name(origin.createdBy)
          ) : (
            <>
              Session <span className={styles.mono}>{origin.session.sessionLabel}</span> (
              {origin.session.userName})
            </>
          )}
        </dd>
        <dt>Depuis</dt>
        <dd>{origin.label}</dd>
        <dt>Scan</dt>
        {mission.suspicious ? (
          <dd className={styles.warn}>
            Instruction suspecte signalée : relisez le prompt avant de le confier à une session
          </dd>
        ) : (
          <dd className={styles.ok}>Aucun secret, aucune instruction suspecte</dd>
        )}
        <dt>Validation</dt>
        <dd className={cx(validation.tone !== 'neutral' && styles[validation.tone])}>
          {validation.text}
        </dd>
      </dl>
    </section>
  )
}

function HistoryPanel({ detail }: { detail: MissionDetail }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <h2 id={headingId} className={cx(styles.sectionTitle, styles.panelHeading)}>
        Historique
      </h2>
      <ol className={styles.list} aria-label="Historique, du plus récent au plus ancien">
        {historyItems(detail).map((item) => (
          <li key={item.key} className={styles.historyRow}>
            <span className={styles.grow}>{item.label}</span>
            <time dateTime={item.at} className={styles.historyDate}>
              {formatShortDateTime(item.at)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  )
}
