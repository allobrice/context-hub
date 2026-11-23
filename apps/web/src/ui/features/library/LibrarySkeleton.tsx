import type { LibrarySort } from '@context-hub/domain/library/criteria.ts'
import { Skeleton } from '../../components/Skeleton/Skeleton.tsx'
import cardStyles from './ContextCards.module.scss'
import { ContextTableColumns, ContextTableHead } from './ContextTable.tsx'
import tableStyles from './ContextTable.module.scss'
import styles from './LibrarySkeleton.module.scss'
import type { LibraryView } from './libraryParams.ts'

/** Largeurs des titres de la maquette 05, pour un chargement qui ne paraît pas mécanique. */
const TITLE_WIDTHS = ['62%', '48%', '70%', '55%', '40%', '66%', '52%', '58%']

/** Squelette de la Bibliothèque (maquette 05). Décoratif : le conteneur porte aria-busy. */
export function LibrarySkeleton({ view, sort }: { view: LibraryView; sort: LibrarySort }) {
  if (view === 'cards') {
    return (
      <div className={cardStyles.grid} aria-hidden="true">
        {TITLE_WIDTHS.slice(0, 6).map((width) => (
          <div key={width} className={styles.card}>
            <Skeleton width={width} height={14} />
            <Skeleton width="90%" height={10} />
            <Skeleton width="40%" height={16} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={tableStyles.wrap}>
      <table className={tableStyles.table} aria-hidden="true">
        <ContextTableColumns />
        <ContextTableHead sort={sort} />
        <tbody>
          {TITLE_WIDTHS.map((width) => (
            <tr key={width} className={styles.row}>
              <td>
                <div className={styles.titleCell}>
                  <Skeleton width={width} height={12} />
                  <Skeleton width="70%" height={10} />
                </div>
              </td>
              <td>
                <Skeleton width={90} height={12} />
              </td>
              <td>
                <Skeleton width={120} height={16} />
              </td>
              <td>
                <Skeleton width={70} height={12} />
              </td>
              <td>
                <Skeleton width={64} height={18} />
              </td>
              <td>
                <Skeleton width={24} height={12} />
              </td>
              <td>
                <Skeleton width={36} height={12} className={styles.end} />
              </td>
              <td>
                <Skeleton width={70} height={12} className={styles.end} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
