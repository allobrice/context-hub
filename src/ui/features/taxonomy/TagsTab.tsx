import { useEffect, useId, useMemo, useRef, useState } from 'react'

import {
  findSimilarTags,
  planTagRename,
  preferredMergeTarget,
} from '../../../domain/taxonomy/tags.ts'
import type { Tag as TagModel } from '../../../domain/taxonomy/types.ts'
import { paths } from '../../app/paths.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { ErrorState } from '../../components/ErrorState/ErrorState.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { IconButton } from '../../components/IconButton/IconButton.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { formatRelativeDate, plural } from '../../lib/format.ts'
import { isRepositoryUnavailable } from '../../../application/errors.ts'
import { MergeTagsDialog, type MergeRequest } from './MergeTagsDialog.tsx'
import styles from './Taxonomy.module.scss'
import { useTaxonomyActions, useTags } from './useTaxonomy.ts'

/** Cible proposée : le tag le plus utilisé d'un groupe proche des sources, sinon le plus utilisé tout court. */
function defaultMergeTarget(sources: readonly string[], tags: readonly TagModel[]): string {
  const byName = new Map(tags.map((tag) => [tag.name, tag]))
  const group = findSimilarTags(tags).find((names) => names.some((name) => sources.includes(name)))
  const candidates = (group ?? tags.map((tag) => tag.name))
    .filter((name) => !sources.includes(name))
    .flatMap((name) => byName.get(name) ?? [])
  return preferredMergeTarget(candidates)?.name ?? ''
}

/**
 * Premier groupe de tags proches. Pendant le chargement, les noms de la navigation suffisent
 * (le bandeau reste visible, maquette 19).
 */
function similarGroup(
  tags: readonly TagModel[],
  tagNames: readonly string[],
): string[] | undefined {
  const source =
    tags.length > 0
      ? tags
      : tagNames.map((name) => ({ name, contextCount: 0, publishedCount: 0, lastUsedAt: null }))
  return findSimilarTags(source)[0]
}

/** Onglet Tags (SPEC §5.4, maquettes 16–20). */
export function TagsTab({ tagNames }: { tagNames: readonly string[] }) {
  const query = useTags()
  const actions = useTaxonomyActions()
  const { clock } = useServices()
  const filterId = useId()
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [merge, setMerge] = useState<MergeRequest | null>(null)
  const [toDelete, setToDelete] = useState<readonly string[] | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const renameButtons = useRef(new Map<string, HTMLButtonElement | null>())
  const now = clock.now()

  const tags = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => b.contextCount - a.contextCount || a.name.localeCompare(b.name, 'fr'),
      ),
    [query.data],
  )
  const visible = tags.filter((tag) => tag.name.includes(filter.trim().toLowerCase()))
  const similar = similarGroup(tags, tagNames)
  const allVisibleSelected = visible.length > 0 && visible.every((tag) => selected.has(tag.name))

  function openMerge(sources: readonly string[]) {
    setMerge({ sources, target: defaultMergeTarget(sources, tags) })
  }

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function stopRenaming(name: string) {
    setRenaming(null)
    renameButtons.current.get(name)?.focus()
  }

  if (query.isError) {
    const { error } = query
    return (
      <ErrorState
        title="Impossible de charger les tags"
        code={isRepositoryUnavailable(error) ? error.summary : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }

  if (query.data && tags.length === 0) {
    return (
      <EmptyState
        icon="tag"
        title="Aucun tag pour l’instant"
        actions={
          <ButtonLink to={paths.newContext()} variant="primary">
            Créer un contexte
          </ButtonLink>
        }
      >
        Les tags se créent depuis l’éditeur d’un contexte. Ils apparaissent ici dès leur première
        utilisation.
      </EmptyState>
    )
  }

  return (
    <>
      {similar && (
        <div className={styles.similar}>
          <Icon name="merge" />
          <span className={styles.similarText}>
            {similar.length} tags proches détectés :{' '}
            {similar.map((name, index) => (
              <span key={name}>
                {index > 0 && ', '}
                <span className={styles.mono}>{name}</span>
              </span>
            ))}
            . Les fusionner améliore la recherche MCP.
          </span>
          <Button
            size="sm"
            disabled={!query.data}
            onClick={() => {
              const byName = new Map(tags.map((tag) => [tag.name, tag]))
              const target =
                preferredMergeTarget(similar.flatMap((name) => byName.get(name) ?? []))?.name ?? ''
              setMerge({ sources: similar.filter((name) => name !== target), target })
            }}
          >
            Fusionner…
          </Button>
        </div>
      )}

      <div className={styles.toolbar}>
        <label htmlFor={filterId} className={styles.filter}>
          <span className="visually-hidden">Filtrer les tags</span>
          <Icon name="search" size={14} className={styles.filterIcon} />
          <input
            id={filterId}
            type="search"
            className={styles.filterInput}
            placeholder="Filtrer les tags…"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value)
            }}
          />
        </label>
        <span className={styles.selection} role="status">
          {selected.size > 0 && plural(selected.size, 'sélectionné', 'sélectionnés')}
        </span>
        <Button
          size="sm"
          icon="merge"
          disabled={selected.size === 0}
          onClick={() => {
            openMerge([...selected])
          }}
        >
          Fusionner la sélection
        </Button>
        <Button
          size="sm"
          className={styles.dangerText}
          disabled={selected.size === 0}
          onClick={() => {
            setToDelete([...selected])
          }}
        >
          Supprimer
        </Button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Tags" aria-busy={query.isPending}>
          <thead>
            <tr>
              <th scope="col" className={styles.checkCell}>
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={allVisibleSelected}
                  disabled={visible.length === 0}
                  onChange={() => {
                    setSelected(
                      allVisibleSelected ? new Set() : new Set(visible.map((tag) => tag.name)),
                    )
                  }}
                />
              </th>
              <th scope="col">Tag</th>
              <th scope="col" className={cx(styles.num, styles.numCol)} aria-sort="descending">
                Contextes ↓
              </th>
              <th scope="col" className={cx(styles.num, styles.numCol)}>
                Publiés
              </th>
              <th scope="col" className={styles.dateCol}>
                Dernier usage
              </th>
              <th scope="col" className={cx(styles.num, styles.actionsCol)}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {!query.data
              ? Array.from({ length: 8 }, (_, index) => (
                  <tr key={index} className={styles.skeletonRow} aria-hidden="true">
                    <td>
                      <Skeleton width={15} height={15} />
                    </td>
                    <td>
                      <Skeleton width={[120, 90, 140, 70, 110, 80, 130, 100][index]} height={14} />
                    </td>
                    <td className={styles.num}>
                      <Skeleton width={24} height={12} />
                    </td>
                    <td>
                      <Skeleton width={24} height={12} />
                    </td>
                    <td>
                      <Skeleton width={80} height={12} />
                    </td>
                    <td>
                      <Skeleton width={70} height={12} />
                    </td>
                  </tr>
                ))
              : visible.map((tag) => (
                  <tr key={tag.name} className={cx(selected.has(tag.name) && styles.selectedRow)}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Sélectionner ${tag.name}`}
                        checked={selected.has(tag.name)}
                        onChange={() => {
                          toggle(tag.name)
                        }}
                      />
                    </td>
                    <td>
                      {renaming === tag.name ? (
                        <InlineRename
                          tag={tag}
                          tags={tags}
                          pending={actions.renameTag.isPending}
                          onCancel={() => {
                            stopRenaming(tag.name)
                          }}
                          onSubmit={(to, isMerge) => {
                            actions.renameTag.mutate(
                              { from: tag.name, to },
                              {
                                onSuccess: () => {
                                  setRenaming(null)
                                  setSelected(new Set())
                                  setAnnouncement(
                                    isMerge
                                      ? `« ${tag.name} » fusionné dans « ${to} ».`
                                      : `« ${tag.name} » renommé en « ${to} ».`,
                                  )
                                },
                              },
                            )
                          }}
                        />
                      ) : (
                        <span className={styles.tagCell}>
                          <Tag name={tag.name} size="lg" />
                          {tag.contextCount === 0 && <Badge>Inutilisé</Badge>}
                        </span>
                      )}
                    </td>
                    <td className={cx(styles.num, styles.numValue)}>{tag.contextCount}</td>
                    <td className={cx(styles.num, styles.numValue)}>{tag.publishedCount}</td>
                    <td>{tag.lastUsedAt ? formatRelativeDate(tag.lastUsedAt, now) : '—'}</td>
                    <td>
                      <div className={styles.actions}>
                        <IconButton
                          ref={(element) => {
                            renameButtons.current.set(tag.name, element)
                          }}
                          icon="pencil"
                          iconSize={14}
                          label={`Renommer ${tag.name}`}
                          onClick={() => {
                            setRenaming(tag.name)
                          }}
                        />
                        <IconButton
                          icon="merge"
                          iconSize={14}
                          label={`Fusionner ${tag.name}…`}
                          onClick={() => {
                            openMerge([tag.name])
                          }}
                        />
                        <IconButton
                          icon="trash"
                          iconSize={14}
                          label={`Supprimer ${tag.name}`}
                          onClick={() => {
                            setToDelete([tag.name])
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <span role="status" className="visually-hidden">
        {announcement}
      </span>

      <MergeTagsDialog
        request={merge}
        tags={tags}
        pending={actions.mergeTags.isPending}
        onCancel={() => {
          setMerge(null)
        }}
        onConfirm={({ sources, target }) => {
          actions.mergeTags.mutate(
            { sources, target },
            {
              onSuccess: () => {
                setMerge(null)
                setSelected(new Set())
                setAnnouncement(`${sources.join(', ')} fusionné(s) dans « ${target} ».`)
              },
            },
          )
        }}
      />

      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title={
          toDelete?.length === 1
            ? `Supprimer le tag « ${toDelete[0] ?? ''} » ?`
            : `Supprimer ${toDelete?.length ?? 0} tags ?`
        }
        confirmLabel={toDelete?.length === 1 ? 'Supprimer le tag' : 'Supprimer les tags'}
        pending={actions.deleteTags.isPending}
        onCancel={() => {
          setToDelete(null)
        }}
        onConfirm={() => {
          if (!toDelete) return
          actions.deleteTags.mutate(toDelete, {
            onSuccess: () => {
              setAnnouncement(`${plural(toDelete.length, 'tag supprimé', 'tags supprimés')}.`)
              setToDelete(null)
              setSelected(new Set())
            },
          })
        }}
      >
        <DeleteTagsImpact names={toDelete ?? []} tags={tags} />
      </ConfirmDialog>
    </>
  )
}

function DeleteTagsImpact({
  names,
  tags,
}: {
  names: readonly string[]
  tags: readonly TagModel[]
}) {
  const concerned = tags.filter((tag) => names.includes(tag.name))
  const contexts = concerned.reduce((sum, tag) => sum + tag.contextCount, 0)
  const published = concerned.reduce((sum, tag) => sum + tag.publishedCount, 0)
  // Plusieurs tags peuvent porter sur le même contexte : on parle alors d'occurrences.
  const unit =
    names.length === 1
      ? (['contexte', 'contextes', 'publié', 'publiés'] as const)
      : (['occurrence', 'occurrences', 'publiée', 'publiées'] as const)
  return (
    <p>
      {contexts === 0
        ? 'Aucun contexte ne porte ce tag.'
        : `Retiré de ${plural(contexts, unit[0], unit[1])} (dont ${plural(published, unit[2], unit[3])}).`}{' '}
      Aucune version n’est créée, les URI ne changent pas.
    </p>
  )
}

interface InlineRenameProps {
  tag: TagModel
  tags: readonly TagModel[]
  pending: boolean
  onSubmit: (to: string, isMerge: boolean) => void
  onCancel: () => void
}

/** Renommage en ligne (maquette 16) : vers un nom existant, l'action devient « Fusionner ». */
function InlineRename({ tag, tags, pending, onSubmit, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(tag.name)
  const inputRef = useRef<HTMLInputElement>(null)
  const messageId = useId()
  const plan = planTagRename(tags, tag.name, value)

  useEffect(() => {
    inputRef.current?.select()
  }, [])

  function submit() {
    if (plan.kind === 'rename') onSubmit(plan.to, false)
    else if (plan.kind === 'merge') onSubmit(plan.into.name, true)
    else if (plan.kind === 'unchanged') onCancel()
  }

  return (
    <div className={styles.rename}>
      <div className={styles.renameRow}>
        <label htmlFor={`${messageId}-input`} className="visually-hidden">
          Nouveau nom de {tag.name}
        </label>
        <input
          ref={inputRef}
          id={`${messageId}-input`}
          className={styles.renameInput}
          value={value}
          aria-describedby={messageId}
          aria-invalid={plan.kind === 'invalid'}
          spellCheck={false}
          onChange={(event) => {
            setValue(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit()
            if (event.key === 'Escape') onCancel()
          }}
        />
        <Button
          size="sm"
          variant="primary"
          disabled={pending || plan.kind === 'invalid'}
          onClick={submit}
        >
          {plan.kind === 'merge' ? 'Fusionner' : 'Renommer'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
      <span
        id={messageId}
        className={plan.kind === 'invalid' ? styles.renameError : styles.renameWarning}
        aria-live="polite"
      >
        {plan.kind === 'merge' &&
          `« ${plan.into.name} » existe déjà (${plural(plan.into.contextCount, 'contexte', 'contextes')}) : renommer revient à fusionner.`}
        {plan.kind === 'invalid' && 'Minuscules, chiffres et tirets uniquement.'}
      </span>
    </div>
  )
}
