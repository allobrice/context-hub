import type { AriaAttributes } from 'react'
import { Link } from 'react-router'

import type { Context } from '../../../domain/context/types.ts'
import type { LibrarySort } from '../../../domain/library/criteria.ts'
import type { Collection } from '../../../domain/taxonomy/types.ts'
import { paths } from '../../app/paths.ts'
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { cx } from '../../lib/cx.ts'
import { formatRelativeDate } from '../../lib/format.ts'
import styles from './ContextTable.module.scss'
import { presentContext } from './contextPresentation.ts'

export interface ContextTableProps {
  contexts: readonly Context[]
  collectionsById: ReadonlyMap<string, Collection>
  sort: LibrarySort
  now: Date
}

type SortableColumn = 'title' | 'updated'

const SORT_COLUMNS: Readonly<Record<LibrarySort, { column: SortableColumn; ascending: boolean }>> =
  {
    'updated-desc': { column: 'updated', ascending: false },
    'updated-asc': { column: 'updated', ascending: true },
    'title-asc': { column: 'title', ascending: true },
    'title-desc': { column: 'title', ascending: false },
  }

/** Flèche visible et `aria-sort` de l'en-tête de colonne triée. */
function sortState(
  sort: LibrarySort,
  column: SortableColumn,
): { arrow: string; aria: AriaAttributes['aria-sort'] } {
  const { column: sorted, ascending } = SORT_COLUMNS[sort]
  if (sorted !== column) return { arrow: '', aria: undefined }
  return ascending ? { arrow: ' ↑', aria: 'ascending' } : { arrow: ' ↓', aria: 'descending' }
}

export function ContextTableColumns() {
  return (
    <colgroup>
      <col className={styles.colTitle} />
      <col className={styles.colCollection} />
      <col className={styles.colTags} />
      <col className={styles.colScope} />
      <col className={styles.colStatus} />
      <col className={styles.colVersion} />
      <col className={styles.colTokens} />
      <col className={styles.colUpdated} />
    </colgroup>
  )
}

export function ContextTableHead({ sort }: { sort: LibrarySort }) {
  const title = sortState(sort, 'title')
  const updated = sortState(sort, 'updated')
  return (
    <thead className={styles.head}>
      <tr>
        <th scope="col" aria-sort={title.aria}>
          Titre{title.arrow}
        </th>
        <th scope="col">Collection</th>
        <th scope="col">Tags</th>
        <th scope="col">Portée</th>
        <th scope="col">Statut</th>
        <th scope="col">
          <abbr title="Version">Ver.</abbr>
        </th>
        <th scope="col" className={styles.right}>
          Tokens
        </th>
        <th scope="col" className={styles.right} aria-sort={updated.aria}>
          Mis à jour{updated.arrow}
        </th>
      </tr>
    </thead>
  )
}

/** Tableau de la Bibliothèque (maquette 01) : vraie <table>, la ligne entière mène au Détail. */
export function ContextTable({ contexts, collectionsById, sort, now }: ContextTableProps) {
  return (
    <div className={styles.wrap}>
      <table className={styles.table} aria-label="Contextes">
        <ContextTableColumns />
        <ContextTableHead sort={sort} />
        <tbody>
          {contexts.map((context) => {
            const listing = presentContext(context, collectionsById)
            return (
              <tr key={context.id} className={styles.row}>
                <td>
                  <div className={styles.titleCell}>
                    <Link to={paths.context(context.id)} className={styles.titleLink}>
                      {context.title}
                    </Link>
                    <span className={styles.description}>{context.description}</span>
                  </div>
                </td>
                <td className={styles.ellipsis}>{listing.collectionName}</td>
                <td>
                  <div className={styles.tags} title={context.tags.join(', ')}>
                    {context.tags.map((tag) => (
                      <Tag key={tag} name={tag} />
                    ))}
                  </div>
                </td>
                <td>
                  <div className={styles.scope}>
                    <span>{listing.scopeLabel}</span>
                    <span className={styles.scopeTarget}>{listing.scopeTarget}</span>
                  </div>
                </td>
                <td>
                  <StatusBadge status={context.status} />
                </td>
                <td className={styles.mono}>{listing.version}</td>
                <td className={cx(styles.mono, styles.right)}>{listing.tokens}</td>
                <td className={styles.right}>
                  <time dateTime={context.updatedAt}>
                    {formatRelativeDate(context.updatedAt, now)}
                  </time>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
