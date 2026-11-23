import { Link } from 'react-router'

import type { Context } from '../../../domain/context/types.ts'
import type { Collection } from '../../../domain/taxonomy/types.ts'
import { paths } from '../../app/paths.ts'
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import styles from './ContextCards.module.scss'
import { presentContext } from './contextPresentation.ts'

export interface ContextCardsProps {
  contexts: readonly Context[]
  collectionsById: ReadonlyMap<string, Collection>
}

/** Vue cartes (maquette 02) : grille auto-fill (min 300 px), la carte entière mène au Détail. */
export function ContextCards({ contexts, collectionsById }: ContextCardsProps) {
  return (
    <ul className={styles.grid} aria-label="Contextes">
      {contexts.map((context) => {
        const listing = presentContext(context, collectionsById)
        return (
          <li key={context.id}>
            <article className={styles.card}>
              <div className={styles.top}>
                <h2 className={styles.title}>
                  <Link to={paths.context(context.id)} className={styles.link}>
                    {context.title}
                  </Link>
                </h2>
                <StatusBadge status={context.status} />
              </div>
              <p className={styles.description}>{context.description}</p>
              <div className={styles.tags}>
                {context.tags.map((tag) => (
                  <Tag key={tag} name={tag} />
                ))}
              </div>
              <div className={styles.footer}>
                <span>{listing.collectionName}</span>
                <span aria-hidden="true">·</span>
                <span>{listing.scopeLabel}</span>
                {listing.version && (
                  <span className={styles.meta}>
                    {listing.version} · {listing.tokens} tok
                  </span>
                )}
              </div>
            </article>
          </li>
        )
      })}
    </ul>
  )
}
