import { useState } from 'react'

import { isRepositoryUnavailable } from '../../../application/errors.ts'
import { canDeleteCollection, canRenameCollection } from '../../../domain/taxonomy/collections.ts'
import type { Collection } from '../../../domain/taxonomy/types.ts'
import { Button } from '../../components/Button/Button.tsx'
import { EmptyState } from '../../components/EmptyState/EmptyState.tsx'
import { ErrorState } from '../../components/ErrorState/ErrorState.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { IconButton } from '../../components/IconButton/IconButton.tsx'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import { cx } from '../../lib/cx.ts'
import { CollectionDialog } from './CollectionDialog.tsx'
import { DeleteCollectionDialog } from './DeleteCollectionDialog.tsx'
import styles from './Taxonomy.module.scss'
import { useCollections, useTaxonomyActions } from './useTaxonomy.ts'

const SYSTEM_HINT = 'Collection système : ni renommable, ni supprimable'

export interface CollectionsTabProps {
  creating: boolean
  onCreatingChange: (creating: boolean) => void
}

/** Onglet Collections (maquettes 21–22). */
export function CollectionsTab({ creating, onCreatingChange }: CollectionsTabProps) {
  const query = useCollections()
  const actions = useTaxonomyActions()
  const [editing, setEditing] = useState<Collection | null>(null)
  const [deleting, setDeleting] = useState<Collection | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const collections = query.data ?? []

  if (query.isError) {
    const { error } = query
    return (
      <ErrorState
        title="Impossible de charger les collections"
        code={isRepositoryUnavailable(error) ? error.summary : undefined}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const dialogs = (
    <>
      <CollectionDialog
        collection={editing}
        open={creating || editing !== null}
        pending={actions.createCollection.isPending || actions.updateCollection.isPending}
        onCancel={() => {
          setEditing(null)
          onCreatingChange(false)
        }}
        onSubmit={(input) => {
          if (editing) {
            actions.updateCollection.mutate(
              { id: editing.id, ...input },
              {
                onSuccess: () => {
                  setAnnouncement(`Collection « ${input.name} » modifiée.`)
                  setEditing(null)
                },
              },
            )
          } else {
            actions.createCollection.mutate(input, {
              onSuccess: () => {
                setAnnouncement(`Collection « ${input.name} » créée.`)
                onCreatingChange(false)
              },
            })
          }
        }}
      />
      <DeleteCollectionDialog
        collection={deleting}
        collections={collections}
        pending={actions.deleteCollection.isPending}
        onCancel={() => {
          setDeleting(null)
        }}
        onConfirm={({ targetId, addFormerNameAsTag }) => {
          if (!deleting) return
          actions.deleteCollection.mutate(
            { deletedId: deleting.id, targetId, addFormerNameAsTag },
            {
              onSuccess: () => {
                setAnnouncement(`Collection « ${deleting.name} » supprimée.`)
                setDeleting(null)
              },
            },
          )
        }}
      />
      <span role="status" className="visually-hidden">
        {announcement}
      </span>
    </>
  )

  if (query.data && collections.length === 0) {
    return (
      <>
        <EmptyState
          icon="folder"
          title="Aucune collection"
          actions={
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                onCreatingChange(true)
              }}
            >
              Nouvelle collection
            </Button>
          }
        >
          Les collections regroupent les contextes par sujet (Nuxt, Review, CI/CD…).
        </EmptyState>
        {dialogs}
      </>
    )
  }

  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label="Collections" aria-busy={query.isPending}>
          <thead>
            <tr>
              <th scope="col">Collection</th>
              <th scope="col">Description</th>
              <th scope="col" className={cx(styles.num, styles.numCol)}>
                Contextes
              </th>
              <th scope="col" className={cx(styles.num, styles.numCol)}>
                Publiés
              </th>
              <th scope="col" className={cx(styles.num, styles.actionsCol)}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {!query.data
              ? Array.from({ length: 6 }, (_, index) => (
                  <tr key={index} className={styles.skeletonRow} aria-hidden="true">
                    <td>
                      <Skeleton width={140} height={14} />
                    </td>
                    <td>
                      <Skeleton width={260} height={12} />
                    </td>
                    <td>
                      <Skeleton width={24} height={12} />
                    </td>
                    <td>
                      <Skeleton width={24} height={12} />
                    </td>
                    <td>
                      <Skeleton width={70} height={12} />
                    </td>
                  </tr>
                ))
              : collections.map((collection) => (
                  <tr key={collection.id}>
                    <th scope="row">
                      <span className={styles.collectionName}>
                        <Icon name="folder" />
                        {collection.name}
                      </span>
                    </th>
                    <td>{collection.description}</td>
                    <td className={cx(styles.num, styles.numValue)}>{collection.contextCount}</td>
                    <td className={cx(styles.num, styles.numValue)}>{collection.publishedCount}</td>
                    <td>
                      <div className={styles.actions}>
                        <IconButton
                          icon="pencil"
                          iconSize={14}
                          label={`Modifier ${collection.name}`}
                          disabled={!canRenameCollection(collection)}
                          title={canRenameCollection(collection) ? undefined : SYSTEM_HINT}
                          onClick={() => {
                            setEditing(collection)
                          }}
                        />
                        <IconButton
                          icon="trash"
                          iconSize={14}
                          label={`Supprimer ${collection.name}`}
                          disabled={!canDeleteCollection(collection)}
                          title={canDeleteCollection(collection) ? undefined : SYSTEM_HINT}
                          onClick={() => {
                            setDeleting(collection)
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        « Sans collection » est une vue système : elle ne se renomme pas et ne se supprime pas.
      </p>
      {dialogs}
    </>
  )
}
