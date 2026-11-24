import { useId, useState } from 'react'
import { Link } from 'react-router'

import { toContextId } from '@context-hub/domain/context/types.ts'
import {
  joinCommand,
  type Claim,
  type WorkspaceDetail,
} from '@context-hub/domain/workspaces/types.ts'
import { paths } from '../../app/paths.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { Button } from '../../components/Button/Button.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { CopyField } from '../../components/CopyField/CopyField.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { failureOf } from '../../lib/errors.ts'
import { useForceRelease } from './useWorkspaces.ts'
import {
  CLAIM_WARNING_MINUTES,
  minutesLeft,
  participantActivity,
  sessionsLabel,
} from './workspacePresentation.ts'
import styles from './Workspace.module.scss'

/** Colonne de droite : rejoindre, participants, zones réservées, contextes liés (maquette 26). */
export function WorkspaceAside({ detail }: { detail: WorkspaceDetail }) {
  const open = detail.workspace.status === 'open'
  return (
    <aside className={styles.aside} aria-label="Sessions et zones réservées">
      {open && <JoinPanel slug={detail.workspace.slug} />}
      <ParticipantsPanel detail={detail} />
      <ClaimsPanel detail={detail} />
      <LinkedContextsPanel detail={detail} />
    </aside>
  )
}

function JoinPanel({ slug }: { slug: string }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, styles.joinPanel)}>
      <div className={styles.panelTitleLine}>
        <Icon name="terminal" />
        <h2 id={headingId} className={styles.sectionTitle}>
          Rejoindre depuis Claude Code
        </h2>
      </div>
      <CopyField value={joinCommand(slug)} copyLabel="Copier la commande" />
      <span className={styles.note}>
        Nécessite le plugin <span className={styles.mono}>context-hub</span>. Il injecte le résumé
        du workspace au démarrage de la session, puis les nouvelles entrées à chaque prompt, et
        bloque l’écriture dans une zone réservée par une autre session.
      </span>
    </section>
  )
}

function ParticipantsPanel({ detail }: { detail: WorkspaceDetail }) {
  const { clock } = useServices()
  const now = clock.now()
  const open = detail.workspace.status === 'open'
  const active = detail.participants.filter((participant) => participant.active).length
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          Participants
        </h2>
        <span className={styles.panelCount}>
          {open ? sessionsLabel(active, detail.participants.length) : detail.participants.length}
        </span>
      </div>
      {detail.participants.length === 0 ? (
        <p className={styles.panelEmpty}>Aucune session n’a encore rejoint ce workspace.</p>
      ) : (
        <ul className={styles.list}>
          {detail.participants.map(({ session, active: isActive, lastSeenAt }) => (
            <li key={`${session.userId}:${session.sessionLabel}`} className={styles.participant}>
              <span
                className={cx(styles.dot, open && isActive ? styles.dotOk : styles.dotIdle)}
                aria-hidden="true"
              />
              <div className={styles.participantText}>
                <span className={styles.session}>{session.sessionLabel}</span>
                <span className={styles.small}>
                  {session.repo === null
                    ? session.userName
                    : `${session.userName} · ${session.repo}`}
                </span>
              </div>
              <span className={styles.activity}>
                {open ? participantActivity(lastSeenAt, isActive, now) : 'déconnecté'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function ClaimsPanel({ detail }: { detail: WorkspaceDetail }) {
  const { clock } = useServices()
  const now = clock.now()
  const open = detail.workspace.status === 'open'
  const release = useForceRelease(detail.workspace.slug)
  const [releasing, setReleasing] = useState<Claim | null>(null)
  const headingId = useId()
  // Le plus récemment réservé d'abord (maquette 26).
  const claims = [...detail.claims].sort((a, b) => b.acquiredAt.localeCompare(a.acquiredAt))

  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          Zones réservées (claims)
        </h2>
        <span className={styles.panelCount}>{claims.length}</span>
      </div>
      {claims.length === 0 ? (
        <p className={styles.panelEmpty}>Aucune zone réservée.</p>
      ) : (
        <ul className={styles.list}>
          {claims.map((claim) => {
            const left = minutesLeft(claim, now)
            return (
              <li key={claim.id} className={styles.claim}>
                <div className={styles.claimLine}>
                  <code className={styles.claimArea}>{claim.area}</code>
                  {open && (
                    <Button
                      size="sm"
                      aria-label={`Libérer de force le claim ${claim.area}`}
                      onClick={() => {
                        setReleasing(claim)
                      }}
                    >
                      Libérer
                    </Button>
                  )}
                </div>
                <div className={styles.claimMeta}>
                  <Tag name={claim.repo} />
                  <span>
                    par <span className={styles.holder}>{claim.holder.sessionLabel}</span>
                  </span>
                  <span
                    className={cx(styles.expiry, left < CLAIM_WARNING_MINUTES && styles.expirySoon)}
                  >
                    expire dans {left} min
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {open && (
        <span className={styles.panelFoot}>
          Un claim expire sans activité de sa session. Le libérer de force prévient la session qui
          le détient.
        </span>
      )}
      <ConfirmDialog
        open={releasing !== null}
        title="Libérer de force ce claim ?"
        confirmLabel="Libérer"
        tone="danger"
        pending={release.isPending}
        error={failureOf(release.error)}
        onConfirm={() => {
          if (!releasing) return
          release.mutate(releasing.id, {
            onSuccess: () => {
              setReleasing(null)
            },
          })
        }}
        onCancel={() => {
          release.reset()
          setReleasing(null)
        }}
      >
        {releasing && (
          <>
            La zone <code className={styles.mono}>{releasing.area}</code> ({releasing.repo}) est
            réservée par la session{' '}
            <span className={styles.mono}>{releasing.holder.sessionLabel}</span> (
            {releasing.holder.userName}). Une entrée système la préviendra ; d’autres sessions
            pourront alors écrire dans cette zone.
          </>
        )}
      </ConfirmDialog>
    </section>
  )
}

function LinkedContextsPanel({ detail }: { detail: WorkspaceDetail }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={cx(styles.panel, styles.linkedPanel)}>
      <h2 id={headingId} className={styles.sectionTitle}>
        Contextes liés
      </h2>
      {detail.linkedContexts.length === 0 ? (
        <p className={styles.muted}>Aucun contexte lié.</p>
      ) : (
        detail.linkedContexts.map((context) => (
          <Link
            key={context.id}
            to={paths.context(toContextId(context.id))}
            className={styles.linked}
          >
            {context.title} <span className={styles.version}>v{context.version}</span>
          </Link>
        ))
      )}
      <span className={styles.note}>
        Ces contextes publiés sont inclus dans le résumé injecté aux sessions.
      </span>
    </section>
  )
}
