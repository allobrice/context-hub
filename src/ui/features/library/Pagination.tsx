import type { Page } from '../../../domain/library/criteria.ts'
import { Button } from '../../components/Button/Button.tsx'
import styles from './Pagination.module.scss'

export interface PaginationProps {
  page: Page<unknown>
  onPageChange: (page: number) => void
}

export function Pagination({ page, onPageChange }: PaginationProps) {
  return (
    <nav className={styles.pagination} aria-label="Pagination">
      <span>
        {page.from}–{page.to} sur {page.total} · Les sessions Claude Code ne voient que les
        contextes <strong className={styles.strong}>publiés</strong> de leur portée
      </span>
      <div className={styles.buttons}>
        <Button
          size="sm"
          disabled={page.page <= 1}
          onClick={() => {
            onPageChange(page.page - 1)
          }}
        >
          Précédent
        </Button>
        <Button
          size="sm"
          disabled={page.page >= page.pageCount}
          onClick={() => {
            onPageChange(page.page + 1)
          }}
        >
          Suivant
        </Button>
      </div>
    </nav>
  )
}
