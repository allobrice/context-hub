import { useState } from 'react'

import { maskSecretsIn } from '@context-hub/domain/context/scan.ts'
import type { Context } from '@context-hub/domain/context/types.ts'
import { listedVersion } from '@context-hub/domain/context/types.ts'
import { MarkdownView } from '../../components/Markdown/MarkdownView.tsx'
import { Segmented } from '../../components/Segmented/Segmented.tsx'
import { formatDateTime } from '../../lib/format.ts'
import styles from './Detail.module.scss'

type ContentMode = 'preview' | 'source'

/** Colonne principale : la version lue par les sessions, en aperçu sanitisé ou en source. */
export function ContentPanel({ context }: { context: Context }) {
  const [mode, setMode] = useState<ContentMode>('preview')
  const version = listedVersion(context)
  const isPublished = context.publishedVersion !== null

  return (
    <article className={styles.main} aria-label="Contenu">
      <div className={styles.toolbar}>
        <Segmented<ContentMode>
          label="Mode d’affichage du contenu"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'preview', label: 'Aperçu' },
            { value: 'source', label: 'Markdown' },
          ]}
        />
        {version && (
          <span className={styles.versionInfo}>
            v{version.number} · {isPublished ? 'publiée le' : 'brouillon du'}{' '}
            {formatDateTime(version.createdAt)}
          </span>
        )}
      </div>
      <div className={styles.content}>
        {!version ? (
          <p className={styles.help}>Ce contexte n’a pas encore de contenu.</p>
        ) : mode === 'preview' ? (
          <MarkdownView content={version.content} />
        ) : (
          <pre className={styles.source}>{maskSecretsIn(version.content)}</pre>
        )}
      </div>
    </article>
  )
}
