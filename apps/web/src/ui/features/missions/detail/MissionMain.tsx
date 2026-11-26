import { useId } from 'react'
import { Link } from 'react-router'

import { toContextId } from '@context-hub/domain/context/types.ts'
import type {
  Deliverable,
  DoneMission,
  DroppedMission,
  MissionDetail,
  MissionEventActor,
} from '@context-hub/domain/missions/types.ts'

import { paths } from '../../../app/paths.ts'
import { MarkdownView } from '../../../components/Markdown/MarkdownView.tsx'
import { cx } from '../../../lib/cx.ts'
import { formatInteger } from '../../../lib/format.ts'
import { actorName, deliverableLabel, formatDayAt } from './missionDetailPresentation.ts'
import styles from './MissionDetail.module.scss'

/** Colonne principale : le prompt rendu, puis le résultat (maquettes 34–38). */
export function MissionMain({ detail }: { detail: MissionDetail }) {
  return (
    <div className={styles.main}>
      <PromptPanel detail={detail} />
      <ResultPanel detail={detail} />
    </div>
  )
}

function PromptPanel({ detail }: { detail: MissionDetail }) {
  const headingId = useId()
  const { linkedContexts } = detail
  return (
    <article aria-labelledby={headingId} className={cx(styles.panel, styles.promptPanel)}>
      <div className={styles.promptHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          Prompt de la mission
        </h2>
        <span className={styles.small}>
          ≈ {formatInteger(detail.promptTokens)} tokens · autonome
        </span>
      </div>
      {/* Instruction écrite par un tiers : rendue assainie, jamais en HTML brut. */}
      <MarkdownView content={detail.mission.prompt} variant="compact" className={styles.prompt} />
      {linkedContexts.length > 0 && (
        <p className={styles.linked}>
          {linkedContexts.length === 1 ? 'Contexte lié : ' : 'Contextes liés : '}
          {linkedContexts.map((context, index) => (
            <span key={context.id}>
              {index > 0 && ', '}
              <Link to={paths.context(toContextId(context.id))}>{context.title}</Link> (v
              {context.version})
            </span>
          ))}
        </p>
      )}
    </article>
  )
}

function ResultPanel({ detail }: { detail: MissionDetail }) {
  const headingId = useId()
  const { mission } = detail
  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, styles.resultPanel)}>
      <h2 id={headingId} className={styles.sectionTitle}>
        Résultat
      </h2>
      {mission.status === 'done' ? (
        <DoneResult mission={mission} detail={detail} />
      ) : mission.status === 'dropped' ? (
        <DroppedResult mission={mission} detail={detail} />
      ) : mission.status === 'in_progress' ? (
        <p className={styles.resultText}>
          En cours de traitement par{' '}
          <span className={styles.mono}>{mission.claim.session.sessionLabel}</span>. La session
          enregistrera ici son résumé, ses livrables et ses mesures avec{' '}
          <span className={styles.mono}>mission_complete</span>, ou une raison d’abandon avec{' '}
          <span className={styles.mono}>mission_drop</span>.
        </p>
      ) : mission.status === 'expired' ? (
        <p className={styles.resultEmpty}>
          Pas de résultat : la mission a expiré sans avoir été prise. Rouvrez-en une nouvelle si le
          constat tient toujours.
        </p>
      ) : (
        <p className={styles.resultEmpty}>
          Pas encore de résultat. La session qui traitera la mission le renseignera à la fin :
          résumé, livrables (PR, commits) et mesures avant / après.
        </p>
      )}
    </section>
  )
}

function DeliverableValue({ deliverable }: { deliverable: Deliverable }) {
  const label = deliverableLabel(deliverable)
  // Seul un lien http(s) est cliquable : la référence vient d'une session (donnée non fiable).
  if (deliverable.kind === 'url' && /^https?:\/\//i.test(deliverable.ref)) {
    return (
      <a
        className={styles.metricLink}
        href={deliverable.ref}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {label}
      </a>
    )
  }
  return <span className={styles.metricLink}>{label}</span>
}

/** Auteur d'une fin de mission : « web-2 (Camille) » pour une session, le nom pour un humain. */
function ActorLabel({ actor, detail }: { actor: MissionEventActor; detail: MissionDetail }) {
  if ('sessionLabel' in actor) {
    return (
      <>
        <span className={styles.mono}>{actor.sessionLabel}</span> ({actor.userName})
      </>
    )
  }
  return <>{actorName(actor, detail.mission, detail.events)}</>
}

function DoneResult({ mission, detail }: { mission: DoneMission; detail: MissionDetail }) {
  const { result } = mission
  const completed = detail.events.findLast((event) => event.type === 'completed')
  return (
    <>
      <MarkdownView content={result.summary} variant="compact" className={styles.resultSummary} />
      {(result.metrics.length > 0 || result.deliverables.length > 0) && (
        <ul className={styles.metrics} aria-label="Mesures et livrables">
          {result.metrics.map((metric) => (
            <li
              key={metric.name}
              className={cx(styles.metric, metric.before !== metric.after && styles.metricChanged)}
            >
              <span className={styles.metricName}>{metric.name}</span>
              <span className={styles.metricValue}>
                {metric.before} → {metric.after}
              </span>
            </li>
          ))}
          {result.deliverables.map((deliverable) => (
            <li key={`${deliverable.kind}:${deliverable.ref}`} className={styles.metric}>
              <span className={styles.metricName}>Livrable</span>
              <DeliverableValue deliverable={deliverable} />
            </li>
          ))}
        </ul>
      )}
      <span className={styles.small}>
        Terminée
        {completed !== undefined && (
          <>
            {' par '}
            <ActorLabel actor={completed.actor} detail={detail} />
          </>
        )}{' '}
        le {formatDayAt(mission.closedAt)} · critères d’acceptation déclarés{' '}
        {result.acceptanceMet ? 'remplis' : 'non remplis'}
      </span>
    </>
  )
}

function DroppedResult({ mission, detail }: { mission: DroppedMission; detail: MissionDetail }) {
  const dropped = detail.events.findLast((event) => event.type === 'dropped')
  return (
    <>
      <p className={styles.resultText}>
        Abandonnée
        {dropped !== undefined && (
          <>
            {' par '}
            <ActorLabel actor={dropped.actor} detail={detail} />
          </>
        )}{' '}
        le {formatDayAt(mission.closedAt)}. Raison :
      </p>
      {/* Raison écrite par une session ou un humain : texte brut. */}
      <p className={styles.reasonText}>{mission.dropReason}</p>
    </>
  )
}
