import { McpConfigBlock } from './McpConfigBlock.tsx'
import styles from './McpPage.module.scss'

/** « Connexion MCP » (décision phase 0) : la configuration du Détail, sans contexte particulier. */
export function McpPage() {
  return (
    <>
      <title>Connexion MCP · Context Hub</title>
      <header className={styles.header}>
        <h1 className={styles.title}>Connexion MCP</h1>
        <span className={styles.subtitle}>Brancher Claude Code sur le serveur Context Hub</span>
      </header>
      <div className={styles.content}>
        <section className={styles.panel}>
          <McpConfigBlock headingLevel={2} />
        </section>
        <ol className={styles.steps}>
          <li>
            Exportez votre jeton dans <span className={styles.mono}>CONTEXT_HUB_TOKEN</span> (jamais
            dans un fichier versionné).
          </li>
          <li>
            Ajoutez le serveur avec la commande CLI, ou versionnez le fichier .mcp.json dans le
            repo.
          </li>
          <li>
            Dans une session, mentionnez un contexte avec{' '}
            <span className={styles.mono}>@context-hub:context://…</span> ou laissez Claude le
            chercher.
          </li>
        </ol>
      </div>
    </>
  )
}
