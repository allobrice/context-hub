import { useState } from 'react'

import { mcpConfig, type McpConfigFormat } from '../../../application/mcpConfig.ts'
import { useServices } from '../../app/providers/servicesContext.ts'
import { CopyField } from '../../components/CopyField/CopyField.tsx'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import styles from './McpConfigBlock.module.scss'

/**
 * « Connecter le serveur » (SPEC §5.2) : bascule CLI (scope user) / .mcp.json (scope project).
 * L'URL vient de VITE_MCP_URL ; le jeton reste une variable d'environnement, jamais en clair.
 */
export function McpConfigBlock({ headingLevel = 3 }: { headingLevel?: 2 | 3 }) {
  const { config } = useServices()
  const [format, setFormat] = useState<McpConfigFormat>('cli')
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <Heading className={styles.label}>Connecter le serveur</Heading>
        <Segmented<McpConfigFormat>
          label="Format de configuration"
          size="sm"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'cli', label: 'CLI' },
            { value: 'mcp-json', label: '.mcp.json' },
          ]}
        />
      </div>
      <CopyField
        multiline
        value={mcpConfig(format, config.mcpUrl)}
        copyLabel="Copier la configuration"
      />
      <p className={styles.help}>
        Transport Streamable HTTP. CLI : scope user (toutes vos sessions) ; .mcp.json : scope
        project (versionné dans le repo).{config.mcpUrl === null && ' Remplacez [HÔTE] ;'} Le jeton
        se lit depuis la variable d’environnement, jamais en clair dans le fichier versionné.
      </p>
    </div>
  )
}
