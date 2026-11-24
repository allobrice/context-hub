import { useState } from 'react'
import { Link } from 'react-router'

import type { WorkspaceDetail, WorkspaceEntry } from '@context-hub/domain/workspaces/types.ts'
import { paths } from '../../app/paths.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { failureOf } from '../../lib/errors.ts'
import { formatDateTime, formatRelativeDate, plural } from '../../lib/format.ts'
import { libraryHref } from '../library/libraryParams.ts'
import { useCloseWorkspace } from './useWorkspaces.ts'
import {
  DISPLAY_STATUS_LABELS,
  DISPLAY_STATUS_TONES,
  formatDuration,
} from './workspacePresentation.ts'
import styles from './Workspace.module.scss'

/** Contexte prérempli depuis le workspace : objectif et décisions chargées. */
function proposalFromWorkspace(detail: WorkspaceDetail, entries: readonly WorkspaceEntry[]) {
  const decisions = entries.filter((entry) => entry.kind === 'decision').reverse()
  return {
    title: detail.workspace.title,
    description: `Synthèse du workspace ${detail.workspace.slug}`,
    content: [
      `# ${detail.workspace.title}`,
      '',
      detail.workspace.goal,
      ...(decisions.length > 0
        ? ['', '## Décisions', '', ...decisions.map((entry) => `- ${entry.body} (#${entry.seq})`)]
        : []),
      '',
      `> Proposé depuis le workspace « ${detail.workspace.slug} ». À relire avant publication.`,
    ].join('\n'),
  }
}

function metaLine(detail: WorkspaceDetail, now: Date): string {
  const { workspace } = detail
  if (workspace.status === 'closed') {
    const duration =
      workspace.closedAt === null
        ? ''
        : ` · ouvert pendant ${formatDuration(workspace.createdAt, workspace.closedAt)}`
    return `${plural(detail.entryCount, 'entrée', 'entrées')} · ${plural(detail.participants.length, 'participant', 'participants')}${duration}`
  }
  const active = detail.participants.filter((participant) => participant.active).length
  return [
    `${plural(active, 'session active', 'sessions actives')} sur ${detail.participants.length}`,
    plural(detail.claims.length, 'zone réservée', 'zones réservées'),
    `créé par ${detail.createdByName} ${formatRelativeDate(workspace.createdAt, now)}`,
  ].join(' · ')
}

export function WorkspaceHeader({
  detail,
  entries,
}: {
  detail: WorkspaceDetail
  entries: readonly WorkspaceEntry[]
}) {
  const { clock } = useServices()
  const { workspace, displayStatus } = detail
  const open = workspace.status === 'open'
  const [confirmClose, setConfirmClose] = useState(false)
  const close = useCloseWorkspace(workspace.slug)

  return (
    <header className={styles.header}>
      <nav aria-label="Fil d’Ariane" className={styles.breadcrumb}>
        <Link to={paths.workspaces()}>Workspaces</Link>
        <span aria-hidden="true">/</span>
        <span className={styles.mono}>{workspace.slug}</span>
      </nav>
      <div className={styles.headerMain}>
        <div className={styles.headerText}>
          <div className={styles.titleLine}>
            <h1 className={styles.title}>{workspace.title}</h1>
            <Badge tone={DISPLAY_STATUS_TONES[displayStatus]} dot>
              {DISPLAY_STATUS_LABELS[displayStatus]}
            </Badge>
          </div>
          {workspace.goal !== '' && (
            <p className={styles.goal}>
              <strong>Objectif :</strong> {workspace.goal}
            </p>
          )}
          <div className={styles.meta}>
            <span>{metaLine(detail, clock.now())}</span>
            <span className={styles.tags}>
              {workspace.repos.map((repo) => (
                <Tag key={repo} name={repo} />
              ))}
            </span>
          </div>
        </div>
        {open && (
          <div className={styles.actions}>
            <Button
              icon="archive"
              onClick={() => {
                setConfirmClose(true)
              }}
            >
              Fermer le workspace
            </Button>
            <ButtonLink
              variant="primary"
              icon="plus"
              to={paths.proposeContext(proposalFromWorkspace(detail, entries))}
            >
              Proposer un contexte
            </ButtonLink>
          </div>
        )}
      </div>

      {!open && (
        <div role="status" className={styles.closedBanner}>
          <Icon name="lock" />
          <span className={styles.grow}>
            {workspace.closedAt === null
              ? 'Workspace fermé'
              : `Workspace fermé le ${formatDateTime(workspace.closedAt)}`}
            {detail.closedByName === null ? ' automatiquement' : ` par ${detail.closedByName}`} :
            lecture seule. Claims libérés, sessions déconnectées.
          </span>
          <Link to={libraryHref({ status: 'draft' })} className={styles.strongLink}>
            Voir les brouillons
          </Link>
        </div>
      )}

      <ConfirmDialog
        open={confirmClose}
        title="Fermer le workspace ?"
        confirmLabel="Fermer le workspace"
        tone="danger"
        pending={close.isPending}
        error={failureOf(close.error)}
        onConfirm={() => {
          close.mutate(undefined, {
            onSuccess: () => {
              setConfirmClose(false)
            },
          })
        }}
        onCancel={() => {
          close.reset()
          setConfirmClose(false)
        }}
      >
        « {workspace.title} » passera en lecture seule : les zones réservées seront libérées et les
        sessions ne pourront plus y écrire. Le journal reste consultable.
      </ConfirmDialog>
    </header>
  )
}
