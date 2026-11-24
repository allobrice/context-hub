import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import type { WorkspaceListFilter } from '../../../application/ports/WorkspaceRepository.ts'
import type { WorkspaceSummary } from '@context-hub/domain/workspaces/types.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { paths } from '../../app/paths.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { LoadErrorState } from '../../components/LoadErrorState/LoadErrorState.tsx'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { plural } from '../../lib/format.ts'
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog.tsx'
import { useWorkspaceList } from './useWorkspaces.ts'
import {
  DISPLAY_STATUS_LABELS,
  DISPLAY_STATUS_TONES,
  formatElapsed,
  sessionsLabel,
} from './workspacePresentation.ts'
import styles from './WorkspacesPage.module.scss'

const FILTERS = [
  { value: 'open', label: 'Ouverts' },
  { value: 'closed', label: 'Fermés' },
  { value: 'all', label: 'Tous' },
] as const satisfies readonly { value: WorkspaceListFilter; label: string }[]

function parseFilter(value: string | null): WorkspaceListFilter {
  return value === 'closed' || value === 'all' ? value : 'open'
}

const EMPTY_FILTER_MESSAGES: Readonly<Record<WorkspaceListFilter, string>> = {
  open: 'Aucun workspace ouvert.',
  closed: 'Aucun workspace fermé.',
  all: 'Aucun workspace.',
}

/** Liste des workspaces (SPEC §7.3, maquettes 23–25). Le filtre de statut est dans l'URL. */
export function WorkspacesPage() {
  const [params, setParams] = useSearchParams()
  const filter = parseFilter(params.get('status'))
  const query = useWorkspaceList(filter)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const isEmpty = query.data?.counts.all === 0

  return (
    <>
      <title>Workspaces · Context Hub</title>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Workspaces</h1>
          <span className={styles.subtitle}>
            Espaces de travail en direct partagés entre sessions Claude Code : journal, décisions,
            zones réservées.
          </span>
        </div>
        <Button
          variant="primary"
          icon="plus"
          onClick={() => {
            setCreating(true)
          }}
        >
          Nouveau workspace
        </Button>
      </header>

      {!isEmpty && (
        <div className={styles.toolbar}>
          <Segmented
            label="Filtrer par statut"
            options={FILTERS}
            value={filter}
            onChange={(next) => {
              setParams(
                (current) => {
                  const nextParams = new URLSearchParams(current)
                  if (next === 'open') nextParams.delete('status')
                  else nextParams.set('status', next)
                  return nextParams
                },
                { replace: true },
              )
            }}
          />
          {query.data && (
            <span className={styles.count}>
              {plural(query.data.items.length, 'workspace', 'workspaces')}
            </span>
          )}
        </div>
      )}

      <div className={styles.body}>
        {query.isPending && <ListSkeleton />}
        {query.isError && (
          <LoadErrorState
            error={query.error}
            title="Impossible de charger les workspaces"
            onRetry={() => void query.refetch()}
          >
            Le serveur Context Hub n’a pas répondu. Les sessions Claude Code continuent de
            fonctionner avec leur dernier état connu.
          </LoadErrorState>
        )}
        {query.data &&
          (isEmpty ? (
            <EmptyWorkspaces
              onCreate={() => {
                setCreating(true)
              }}
            />
          ) : query.data.items.length === 0 ? (
            <p className={styles.noResult}>{EMPTY_FILTER_MESSAGES[filter]}</p>
          ) : (
            <>
              <WorkspaceTable items={query.data.items} />
              <span className={styles.footnote}>
                Un workspace ouvert sans activité pendant 7 jours passe en « Inactif », puis il est
                fermé automatiquement après 30 jours.
              </span>
            </>
          ))}
      </div>

      <CreateWorkspaceDialog
        open={creating}
        onCancel={() => {
          setCreating(false)
        }}
        onCreated={(slug) => {
          setCreating(false)
          void navigate(paths.workspace(slug))
        }}
      />
    </>
  )
}

function WorkspaceTable({ items }: { items: readonly WorkspaceSummary[] }) {
  const { clock } = useServices()
  const now = clock.now()
  return (
    <div className={styles.tableWrap}>
      <div role="table" aria-label="Workspaces" className={styles.table}>
        <div role="rowgroup">
          <div role="row" className={cx(styles.row, styles.headRow)}>
            <span role="columnheader">Workspace</span>
            <span role="columnheader">Repos</span>
            <span role="columnheader">Sessions</span>
            <span role="columnheader" className={styles.end}>
              Claims
            </span>
            <span role="columnheader" className={styles.end} aria-sort="descending">
              Activité ↓
            </span>
            <span role="columnheader">Statut</span>
          </div>
        </div>
        <div role="rowgroup">
          {items.map(({ workspace, displayStatus, activeSessions, sessionCount, claimCount }) => (
            <div role="row" key={workspace.id} className={cx(styles.row, styles.bodyRow)}>
              <span role="cell" className={styles.titleCell}>
                <span className={styles.titleLine}>
                  {/* Le lien couvre toute la ligne (::after) : la ligne entière est cliquable. */}
                  <Link to={paths.workspace(workspace.slug)} className={styles.rowLink}>
                    {workspace.title}
                  </Link>
                  <span className={styles.slug}>{workspace.slug}</span>
                </span>
                <span className={styles.goal}>{workspace.goal}</span>
              </span>
              <span role="cell" className={styles.repos}>
                {workspace.repos.map((repo) => (
                  <Tag key={repo} name={repo} />
                ))}
              </span>
              <span role="cell" className={styles.sessions}>
                <span
                  className={cx(styles.dot, activeSessions > 0 ? styles.dotActive : styles.dotIdle)}
                  aria-hidden="true"
                />
                {sessionsLabel(activeSessions, sessionCount)}
              </span>
              <span role="cell" className={cx(styles.end, styles.mono)}>
                {claimCount}
              </span>
              <span role="cell" className={styles.end}>
                {formatElapsed(workspace.lastActivityAt, now)}
              </span>
              <span role="cell">
                <Badge tone={DISPLAY_STATUS_TONES[displayStatus]} dot>
                  {DISPLAY_STATUS_LABELS[displayStatus]}
                </Badge>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className={styles.tableWrap} aria-busy="true" aria-label="Chargement des workspaces">
      <div className={cx(styles.row, styles.headRow)} aria-hidden="true">
        <Skeleton width={90} height={10} />
      </div>
      {[0, 1, 2].map((index) => (
        <div key={index} className={cx(styles.row, styles.bodyRow)} aria-hidden="true">
          <span className={styles.titleCell}>
            <Skeleton width="60%" height={12} />
            <Skeleton width="80%" height={10} />
          </span>
          <Skeleton width={120} height={18} />
          <Skeleton width={90} height={12} />
          <Skeleton width={20} height={12} className={styles.end} />
          <Skeleton width={70} height={12} className={styles.end} />
          <Skeleton width={64} height={20} />
        </div>
      ))}
    </div>
  )
}

function EmptyWorkspaces({ onCreate }: { onCreate: () => void }) {
  return (
    <EmptyState
      icon="workspace"
      title="Aucun workspace"
      actions={
        <>
          <Button variant="primary" onClick={onCreate}>
            Créer un workspace
          </Button>
          <span className={styles.orSession}>ou depuis une session :</span>
          <code className={styles.snippet}>/context-hub:new "Migration auth"</code>
        </>
      }
    >
      Un workspace relie plusieurs sessions Claude Code qui travaillent sur un même sujet. Elles
      partagent un journal (notes, décisions, questions) et réservent les zones du code qu’elles
      modifient, pour ne pas se marcher dessus.
    </EmptyState>
  )
}
