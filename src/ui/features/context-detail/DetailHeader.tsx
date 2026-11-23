import { Link } from 'react-router'

import type { ContextDetail } from '../../../application/ports/ContextRepository.ts'
import { scanContent } from '../../../domain/context/scan.ts'
import { listedVersion, scopeTarget } from '../../../domain/context/types.ts'
import { paths } from '../../app/paths.ts'
import { Badge } from '../../components/Badge/Badge.tsx'
import { Button } from '../../components/Button/Button.tsx'
import { ButtonLink } from '../../components/Button/ButtonLink.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import { Menu, type MenuItem } from '../../components/Menu/Menu.tsx'
import { StatusBadge } from '../../components/StatusBadge/StatusBadge.tsx'
import { cx } from '../../lib/cx.ts'
import { formatInteger, formatRelativeDate } from '../../lib/format.ts'
import { SCOPE_LABELS } from '../../lib/labels.ts'
import styles from './Detail.module.scss'
import { scanSummary } from './scanSummary.ts'

export interface DetailHeaderProps {
  detail: ContextDetail
  now: Date
  onArchive: () => void
  onUnarchive: () => void
  onCopyUri: () => void
}

/** En-tête du Détail (SPEC §5.2) : fil d'Ariane, titre, badges, actions et bandeaux d'état. */
export function DetailHeader({
  detail,
  now,
  onArchive,
  onUnarchive,
  onCopyUri,
}: DetailHeaderProps) {
  const { context, collectionName } = detail
  const version = listedVersion(context)
  const scan = version && scanSummary(scanContent(version.content), version.number)
  const isArchived = context.status === 'archived'
  const { draft, publishedVersion } = context
  const editPath = paths.editContext(context.id)

  const menuItems: MenuItem[] = [
    { id: 'copy-uri', label: 'Copier l’URI', onSelect: onCopyUri },
    ...(isArchived ? [{ id: 'unarchive', label: 'Désarchiver', onSelect: onUnarchive }] : []),
  ]

  return (
    <header className={styles.header}>
      <nav aria-label="Fil d’Ariane">
        <ol className={styles.breadcrumb}>
          <li>
            <Link to={paths.library}>Bibliothèque</Link>
          </li>
          <li>{collectionName ?? 'Sans collection'}</li>
          <li className={styles.slug} aria-current="page">
            {context.slug}
          </li>
        </ol>
      </nav>

      <div className={styles.titleRow}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{context.title}</h1>
          <p className={styles.description}>{context.description}</p>
          <div className={styles.badges}>
            <StatusBadge status={context.status} />
            {version && <Badge className={styles.badgeMono}>v{version.number}</Badge>}
            <span className={styles.inline}>
              <Icon name="users" size={14} />
              {SCOPE_LABELS[context.scope.kind]} · {scopeTarget(context.scope)}
            </span>
            {version && (
              <span className={styles.tokens}>≈ {formatInteger(version.tokenEstimate)} tokens</span>
            )}
            {scan && (
              <span className={cx(styles.inline, styles[scan.tone])}>
                <Icon name={scan.icon} size={14} />
                {scan.label}
              </span>
            )}
          </div>
        </div>
        <div className={styles.actions}>
          {!isArchived && (
            <Button icon="archive" onClick={onArchive}>
              Archiver
            </Button>
          )}
          <ButtonLink to={editPath} variant="primary" icon="pencil">
            Éditer
          </ButtonLink>
          <Menu label="Plus d’actions" items={menuItems} />
        </div>
      </div>

      {draft && publishedVersion && (
        <div className={cx(styles.banner, styles.bannerWarn)}>
          <Icon name="pencil" />
          <span className={styles.bannerText}>
            Brouillon <strong>v{draft.number}</strong> en cours ({draft.author},{' '}
            {formatRelativeDate(draft.createdAt, now)}). Les sessions Claude Code lisent toujours la{' '}
            <strong>v{publishedVersion.number} publiée</strong>.
          </span>
          <Link to={editPath} className={styles.bannerAction}>
            Reprendre le brouillon
          </Link>
        </div>
      )}

      {isArchived && (
        <div className={cx(styles.banner, styles.bannerNeutral)}>
          <Icon name="archive" />
          <span className={styles.bannerText}>
            Contexte archivé : les sessions Claude Code ne le lisent plus.
          </span>
          <button type="button" className={styles.bannerButton} onClick={onUnarchive}>
            Désarchiver
          </button>
        </div>
      )}
    </header>
  )
}
