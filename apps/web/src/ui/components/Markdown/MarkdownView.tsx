import Markdown, { type Components } from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { maskSecretsIn } from '@context-hub/domain/context/scan.ts'
import { cx } from '../../lib/cx.ts'
import styles from './Markdown.module.scss'

/**
 * Le contenu d'un contexte est une DONNÉE NON FIABLE (CLAUDE.md) :
 * - HTML brut ignoré (`skipHtml`) puis arbre assaini (`rehype-sanitize`) — jamais de rehype-raw ;
 * - images distantes jamais chargées : une URL d'image peut exfiltrer des données (pixel de suivi) ;
 * - liens ouverts sans référent ni accès à la page ;
 * - secrets masqués à l'affichage.
 */
const components: Components = {
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  img: ({ alt }) => (
    <span className={styles.blockedImage}>[image non chargée{alt ? ` : ${alt}` : ''}]</span>
  ),
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
}

const REMARK_PLUGINS = [remarkGfm]
const REHYPE_PLUGINS = [rehypeSanitize]

export interface MarkdownViewProps {
  content: string
  variant?: 'reading' | 'compact'
  className?: string | undefined
}

export function MarkdownView({ content, variant = 'reading', className }: MarkdownViewProps) {
  return (
    <div className={cx(styles.markdown, variant === 'compact' && styles.compact, className)}>
      <Markdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
        skipHtml
      >
        {maskSecretsIn(content)}
      </Markdown>
    </div>
  )
}
