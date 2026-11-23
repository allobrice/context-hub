import type { ContextDetail } from '../../../application/ports/ContextRepository.ts'
import type { ContextVersion } from '../../../domain/context/types.ts'
import { scopeTarget } from '../../../domain/context/types.ts'
import { mention, pinnedUri, resourceUri } from '../../../domain/context/uri.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { CopyField } from '../../components/CopyField/CopyField.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Tag } from '../../components/Tag/Tag.tsx'
import { Tooltip } from '../../components/Tooltip/Tooltip.tsx'
import {
  formatDate,
  formatDateTime,
  formatRelativeDate,
  formatShortDateTime,
} from '../../lib/format.ts'
import { SCOPE_LABELS } from '../../lib/labels.ts'
import { McpConfigBlock } from '../mcp/McpConfigBlock.tsx'
import styles from './Detail.module.scss'

/** « Utiliser dans Claude Code » : mention, URI, URI figée et configuration du serveur. */
export function UsePanel({ detail }: { detail: ContextDetail }) {
  const { context } = detail
  const published = context.publishedVersion
  return (
    <section className={styles.panel} aria-labelledby="use-in-claude-code">
      <h2 id="use-in-claude-code" className={styles.panelTitle}>
        <Icon name="terminal" />
        Utiliser dans Claude Code
      </h2>
      <div className={styles.group}>
        <h3 className={styles.groupLabel}>Mention dans un prompt</h3>
        <CopyField value={mention(context)} copyLabel="Copier la mention" />
      </div>
      <div className={styles.group}>
        <h3 className={styles.groupLabel}>URI de la resource</h3>
        <CopyField value={resourceUri(context)} copyLabel="Copier l’URI" />
        {published ? (
          <>
            <CopyField
              value={pinnedUri(context, published.number)}
              copyLabel={`Copier l’URI figée en v${published.number}`}
            />
            <p className={styles.help}>
              Sans suffixe : toujours la dernière version publiée. Avec{' '}
              <span className={styles.mono}>@{published.number}</span> : figée sur la v
              {published.number}.
            </p>
          </>
        ) : (
          <p className={styles.help}>
            Pas encore publié : les sessions Claude Code ne voient pas ce contexte.
          </p>
        )}
      </div>
      <McpConfigBlock />
      <p className={styles.note}>
        <Icon name="shield" />
        <span>
          Ce contenu est injecté tel quel dans les sessions de l’équipe. Il est traité comme une
          donnée, pas comme une instruction de confiance : relisez-le avant publication.
        </span>
      </p>
    </section>
  )
}

/** Métadonnées (liste de définitions). */
export function MetadataPanel({ detail }: { detail: ContextDetail }) {
  const { context, collectionName } = detail
  return (
    <section className={styles.panel} aria-labelledby="metadata">
      <h2 id="metadata" className={styles.panelTitle}>
        Métadonnées
      </h2>
      <dl className={styles.metadata}>
        <dt>Collection</dt>
        <dd>{collectionName ?? 'Sans collection'}</dd>
        <dt>Tags</dt>
        <dd className={styles.tagList}>
          {context.tags.length > 0 ? context.tags.map((tag) => <Tag key={tag} name={tag} />) : '—'}
        </dd>
        <dt>Portée</dt>
        <dd>
          {SCOPE_LABELS[context.scope.kind]} · {scopeTarget(context.scope)}
        </dd>
        <dt>Auteur</dt>
        <dd>{context.author}</dd>
        <dt>Créé</dt>
        <dd>{formatDate(context.createdAt)}</dd>
        <dt>Mis à jour</dt>
        <dd>{formatDateTime(context.updatedAt)}</dd>
        <dt>Lectures MCP</dt>
        <dd>{context.mcpReads7d} sur 7 jours</dd>
        <dt>Slug</dt>
        <dd className={styles.mono}>{context.slug}</dd>
      </dl>
    </section>
  )
}

export interface HistoryPanelProps {
  detail: ContextDetail
  now: Date
  onRestore: (version: ContextVersion) => void
}

/** Historique : brouillon, version courante, et « Restaurer » sur les anciennes versions. */
export function HistoryPanel({ detail, now, onRestore }: HistoryPanelProps) {
  const { context, history } = detail
  const currentNumber = context.publishedVersion?.number
  return (
    <section className={styles.history} aria-labelledby="history">
      <div className={styles.historyHead}>
        <h2 id="history" className={styles.panelTitle}>
          <Icon name="clock" />
          Historique des versions
        </h2>
        <Tooltip content="La comparaison de versions arrive dans une prochaine version.">
          {(trigger) => (
            <Button size="sm" aria-disabled="true" {...trigger}>
              Comparer…
            </Button>
          )}
        </Tooltip>
      </div>
      <ol className={styles.versions} aria-label="Versions">
        {context.draft && (
          <li className={styles.version}>
            <span className={styles.versionNumber}>v{context.draft.number}</span>
            <div className={styles.versionBody}>
              <span className={styles.versionNote}>{context.draft.note || 'Sans note'}</span>
              <span className={styles.versionMeta}>
                {context.draft.author} · {formatRelativeDate(context.draft.createdAt, now)}
              </span>
            </div>
            <Badge tone="warn" className={styles.versionAside}>
              Brouillon
            </Badge>
          </li>
        )}
        {history.map((version) => (
          <li key={version.number} className={styles.version}>
            <span className={styles.versionNumber}>v{version.number}</span>
            <div className={styles.versionBody}>
              <span className={styles.versionNote}>{version.note}</span>
              <span className={styles.versionMeta}>
                {version.author} · {formatShortDateTime(version.createdAt)}
              </span>
            </div>
            {version.number === currentNumber ? (
              <Badge tone="ok" className={styles.versionAside}>
                Courante
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className={styles.versionAside}
                aria-label={`Restaurer la v${version.number}`}
                onClick={() => {
                  onRestore(version)
                }}
              >
                Restaurer
              </Button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
