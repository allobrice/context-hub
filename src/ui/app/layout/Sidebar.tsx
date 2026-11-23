import { Link, NavLink, useLocation } from 'react-router'

import { isCollectionListed } from '../../../domain/taxonomy/collections.ts'
import type { ScopeKind } from '../../../domain/context/types.ts'
import { SCOPE_KINDS } from '../../../domain/context/types.ts'
import { IconButton } from '../../components/IconButton/IconButton.tsx'
import { Icon } from '../../components/Icon/Icon.tsx'
import type { IconName } from '../../components/Icon/icons.ts'
import { cx } from '../../lib/cx.ts'
import { SCOPE_LABELS } from '../../lib/labels.ts'
import { useWorkspaceOverview } from '../queries.ts'
import { useTheme } from '../theme/themeContext.ts'
import { libraryHref } from '../../features/library/libraryParams.ts'
import styles from './Sidebar.module.scss'

/** Chaîne garantie : NavLink n'accepte pas `undefined` avec exactOptionalPropertyTypes. */
const linkClassName = cx(styles.link)

const SCOPE_ICONS: Readonly<Record<ScopeKind, IconName>> = {
  personal: 'user',
  project: 'branch',
  team: 'users',
}

function initials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

/** Navigation principale (SPEC §4). Collections et portées : uniquement sur la Bibliothèque (décision phase 0). */
export function Sidebar() {
  const { data: overview } = useWorkspaceOverview()
  const { theme, toggleTheme } = useTheme()
  const { pathname } = useLocation()
  const onLibrary = pathname === '/'
  /** La Bibliothèque reste l'entrée active sur le Détail et l'Éditeur d'un contexte (maquettes 08, 12). */
  const inLibrary = onLibrary || pathname.startsWith('/contexts/')
  const collections = overview?.collections.filter(isCollectionListed)

  return (
    <nav aria-label="Navigation principale" className={styles.sidebar}>
      <Link to="/" className={styles.brand}>
        <span className={styles.logo} aria-hidden="true">
          ch
        </span>
        <span className={styles.brandText}>
          <span className={styles.brandName}>Context Hub</span>
          <span className={styles.brandSub}>{overview?.workspaceName ?? ' '}</span>
        </span>
      </Link>

      <div className={styles.group}>
        <Link to="/" className={linkClassName} aria-current={inLibrary ? 'page' : undefined}>
          <Icon name="book" />
          <span className={styles.label}>Bibliothèque</span>
          {overview && <span className={styles.count}>{overview.contextCount}</span>}
        </Link>
        <NavLink to="/taxonomy" className={linkClassName}>
          <Icon name="tag" />
          <span className={styles.label}>Tags &amp; collections</span>
        </NavLink>
        <NavLink to="/mcp" className={linkClassName}>
          <Icon name="plug" />
          <span className={styles.label}>Connexion MCP</span>
        </NavLink>
      </div>

      {onLibrary && overview && (
        <>
          <div className={styles.group} role="group" aria-labelledby="sidebar-collections">
            <span id="sidebar-collections" className={styles.groupTitle}>
              Collections
            </span>
            {collections?.map((collection) => (
              <Link
                key={collection.id}
                to={libraryHref({ collectionId: collection.id })}
                className={linkClassName}
              >
                <Icon name="folder" size={14} />
                <span className={styles.label}>{collection.name}</span>
                <span className={styles.count}>{collection.contextCount}</span>
              </Link>
            ))}
          </div>
          <div className={styles.group} role="group" aria-labelledby="sidebar-scopes">
            <span id="sidebar-scopes" className={styles.groupTitle}>
              Portée
            </span>
            {SCOPE_KINDS.map((kind) => (
              <Link key={kind} to={libraryHref({ scope: kind })} className={linkClassName}>
                <Icon name={SCOPE_ICONS[kind]} size={14} />
                <span className={styles.label}>{SCOPE_LABELS[kind]}</span>
                <span className={styles.count}>{overview.scopeCounts[kind]}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      <div className={styles.footer}>
        {overview && (
          <div className={styles.server}>
            <span
              className={cx(
                styles.dot,
                overview.mcpServer.status === 'online' ? styles.online : styles.offline,
              )}
              aria-hidden="true"
            />
            <span>
              {overview.mcpServer.status === 'online'
                ? 'Serveur MCP en ligne'
                : 'Serveur MCP hors ligne'}
            </span>
            <span className={styles.transport}>{overview.mcpServer.transport}</span>
          </div>
        )}
        <div className={styles.user}>
          <span className={styles.avatar} aria-hidden="true">
            {overview ? initials(overview.currentUser.name) : ''}
          </span>
          <span className={styles.userName}>{overview?.currentUser.name}</span>
          <IconButton
            icon="moon"
            label="Basculer le thème clair / sombre"
            title={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
            aria-pressed={theme === 'dark'}
            onClick={toggleTheme}
          />
        </div>
      </div>
    </nav>
  )
}
