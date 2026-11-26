import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import type { MissionList, MissionQueueFilter } from '@context-hub/domain/missions/types.ts'

import type { MissionListQuery } from '../../../../application/ports/MissionRepository.ts'
import { paths } from '../../../app/paths.ts'
import { Button } from '../../../components/Button/Button.tsx'
import { ButtonLink } from '../../../components/Button/ButtonLink.tsx'
import { EmptyState } from '../../../components/EmptyState/EmptyState.tsx'
import { LoadErrorState } from '../../../components/LoadErrorState/LoadErrorState.tsx'
import { MissionFormDialog } from '../shared/MissionFormDialog.tsx'
import { useMissionList } from '../shared/useMissions.ts'
import { FacetFilter, QueueFilter } from './MissionFilters.tsx'
import { MissionOrigin } from './MissionOrigin.tsx'
import {
  DEFAULT_MISSION_QUERY,
  facetValues,
  nextCommand,
  parseMissionParams,
  toggleTag,
  writeMissionParams,
} from './missionParams.ts'
import { MissionTable, MissionTableSkeleton } from './MissionTable.tsx'
import styles from './MissionsPage.module.scss'

const NO_RESULT_MESSAGES: Readonly<Record<MissionQueueFilter, string>> = {
  todo: 'Aucune mission à traiter pour ces filtres.',
  to_validate: 'Aucune mission à valider.',
  ready: 'Aucune mission prête.',
  archived: 'Aucune mission archivée.',
  all: 'Aucune mission.',
}

/** La file est vide au sens de la maquette 32 : rien à traiter, sans filtre de tags, repo ou lot. */
function isQueueEmpty(query: MissionListQuery, list: MissionList): boolean {
  return (
    query.filter === 'todo' &&
    list.counts.todo === 0 &&
    query.tags.length === 0 &&
    query.repo === null &&
    query.batchId === null
  )
}

/** File des missions (SPEC §8.4, maquettes 31–33). Les filtres sont dans l'URL (`missionParams`). */
export function MissionsPage() {
  const [params, setParams] = useSearchParams()
  const query = parseMissionParams(params)
  const list = useMissionList(query)
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const isEmpty = list.data !== undefined && isQueueEmpty(query, list.data)

  const update = (patch: Partial<MissionListQuery>) => {
    setParams((current) => writeMissionParams({ ...query, ...patch }, current), { replace: true })
  }
  const openCreate = () => {
    setCreating(true)
  }

  return (
    <>
      <title>Missions · Context Hub</title>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>Missions</h1>
          <span className={styles.subtitle}>
            Travail à faire, préparé par une session pour une autre. Une mission est prise par une
            seule session, traitée, puis archivée avec son résultat.
          </span>
        </div>
        <code className={styles.snippet} title="Commande Claude Code">
          {nextCommand(query.tags)}
        </code>
        <Button variant="primary" icon="plus" onClick={openCreate}>
          Nouvelle mission
        </Button>
      </header>

      {query.batchId !== null && <MissionOrigin batchId={query.batchId} />}

      {!isEmpty && (
        <div className={styles.toolbar}>
          <QueueFilter
            value={query.filter}
            counts={list.data?.counts}
            onChange={(filter) => {
              update({ filter })
            }}
          />
          <FacetFilter
            name="Tags"
            selection="multiple"
            activeValue={query.tags.length > 0 ? query.tags.join(', ') : null}
            values={facetValues(
              list.data?.items.flatMap((mission) => mission.tags) ?? [],
              query.tags,
            )}
            isChecked={(tag) => query.tags.includes(tag)}
            onSelect={(tag) => {
              update({ tags: toggleTag(query.tags, tag) })
            }}
            onClear={() => {
              update({ tags: [] })
            }}
          />
          <FacetFilter
            name="Repo"
            selection="single"
            activeValue={query.repo}
            values={facetValues(
              list.data?.items.map((mission) => mission.codeRef.repo) ?? [],
              query.repo === null ? [] : [query.repo],
            )}
            isChecked={(repo) => repo === query.repo}
            onSelect={(repo) => {
              update({ repo: repo === query.repo ? null : repo })
            }}
            onClear={() => {
              update({ repo: null })
            }}
          />
          <span className={styles.sortHint}>Tri : priorité, puis ancienneté</span>
        </div>
      )}

      <div className={styles.body}>
        {list.isPending && <MissionTableSkeleton />}
        {list.isError && (
          <LoadErrorState
            error={list.error}
            title="Impossible de charger les missions"
            onRetry={() => void list.refetch()}
          >
            Le serveur Context Hub n’a pas répondu. Les missions déjà prises par une session
            continuent d’être traitées.
          </LoadErrorState>
        )}
        {list.data &&
          (isEmpty ? (
            <EmptyMissions
              onCreate={openCreate}
              archivedHref={
                list.data.counts.archived > 0
                  ? paths.missions(
                      writeMissionParams(
                        { ...DEFAULT_MISSION_QUERY, filter: 'archived' },
                        params,
                      ).toString(),
                    )
                  : null
              }
            />
          ) : list.data.items.length === 0 ? (
            <p className={styles.noResult}>{NO_RESULT_MESSAGES[query.filter]}</p>
          ) : (
            <MissionTable items={list.data.items} />
          ))}
      </div>

      {creating && (
        <MissionFormDialog
          open
          mode={{ kind: 'create' }}
          onCancel={() => {
            setCreating(false)
          }}
          onSaved={(slug) => {
            setCreating(false)
            void navigate(paths.mission(slug))
          }}
        />
      )}
    </>
  )
}

interface EmptyMissionsProps {
  onCreate: () => void
  /** Lien vers les missions archivées, s'il y en a. */
  archivedHref: string | null
}

/** Maquette 32 : ce qu'est une mission, création et commande du plugin. */
function EmptyMissions({ onCreate, archivedHref }: EmptyMissionsProps) {
  return (
    <EmptyState
      icon="mission"
      title="Aucune mission en attente"
      actions={
        <>
          <Button variant="primary" onClick={onCreate}>
            Nouvelle mission
          </Button>
          {archivedHref !== null && (
            <ButtonLink to={archivedHref}>Voir les missions archivées</ButtonLink>
          )}
        </>
      }
    >
      Une session qui identifie du travail à faire plus tard (axes d’un audit, dette repérée, suite
      d’une tâche) le consigne en mission : un prompt autonome, rattaché au code de départ. Une
      autre session la prend avec <code className={styles.inlineCode}>/context-hub:next</code>, la
      traite, puis enregistre son résultat.
    </EmptyState>
  )
}
