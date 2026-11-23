import { Outlet } from 'react-router'

import styles from './AppLayout.module.scss'
import { Sidebar } from './Sidebar.tsx'

export const MAIN_CONTENT_ID = 'contenu'

export function AppLayout() {
  return (
    <div className={styles.layout}>
      <a className={styles.skipLink} href={`#${MAIN_CONTENT_ID}`}>
        Aller au contenu
      </a>
      <Sidebar />
      <main id={MAIN_CONTENT_ID} className={styles.main} tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
