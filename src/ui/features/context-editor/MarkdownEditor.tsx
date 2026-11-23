import { useDeferredValue, useLayoutEffect, useRef, type ReactNode } from 'react'

import { countLines, estimateTokens } from '../../../domain/context/tokens.ts'
import { Icon } from '../../components/Icon/Icon.tsx'
import { MarkdownView } from '../../components/Markdown/MarkdownView.tsx'
import { cx } from '../../lib/cx.ts'
import { formatInteger, plural } from '../../lib/format.ts'
import styles from './Editor.module.scss'
import {
  applyMarkdownCommand,
  type MarkdownCommand,
  type TextSelection,
} from './markdownCommands.ts'

const PLACEHOLDER = `# Titre du contexte

Décrivez une règle, une convention ou une décision.
Écrivez pour un agent : impératif, concis, avec exemples.`

const TOOLS: readonly {
  command: MarkdownCommand
  label: string
  glyph: ReactNode
  className?: string | undefined
}[] = [
  { command: 'heading', label: 'Titre', glyph: 'H' },
  { command: 'bold', label: 'Gras', glyph: 'B', className: styles.bold },
  { command: 'italic', label: 'Italique', glyph: 'I', className: styles.italic },
  { command: 'code', label: 'Code', glyph: '</>', className: styles.codeGlyph },
  { command: 'list', label: 'Liste', glyph: <Icon name="list" size={14} /> },
  { command: 'link', label: 'Lien', glyph: <Icon name="link" size={14} /> },
]

export interface MarkdownEditorProps {
  id: string
  value: string
  onChange: (value: string) => void
  /** Lignes signalées par le scan (numéros à partir de 1). */
  flaggedLines: ReadonlySet<number>
  /** Id du résultat du scan, lu après le contenu. */
  describedBy?: string
}

/**
 * Éditeur en split (maquette 12) : source à gauche (textarea mono, gouttière, ligne d'un finding
 * en danger-soft avec une barre danger), aperçu sanitisé à droite, rendu en priorité basse.
 */
export function MarkdownEditor({
  id,
  value,
  onChange,
  flaggedLines,
  describedBy,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pendingSelection = useRef<TextSelection | null>(null)
  const preview = useDeferredValue(value)
  const lineCount = value === '' ? 0 : countLines(value)
  const lines = Array.from({ length: Math.max(lineCount, 1) }, (_, index) => index + 1)

  // Après une commande de la barre d'outils : rendre le focus et la sélection au textarea.
  useLayoutEffect(() => {
    const selection = pendingSelection.current
    const textarea = textareaRef.current
    if (!selection || !textarea) return
    pendingSelection.current = null
    textarea.focus()
    textarea.setSelectionRange(selection.start, selection.end)
  }, [value])

  function run(command: MarkdownCommand) {
    const textarea = textareaRef.current
    if (!textarea) return
    const next = applyMarkdownCommand(
      { value, start: textarea.selectionStart, end: textarea.selectionEnd },
      command,
    )
    pendingSelection.current = next
    onChange(next.value)
  }

  return (
    <section className={styles.editor} aria-label="Contenu Markdown">
      <div className={styles.toolbar} role="group" aria-label="Mise en forme">
        {TOOLS.map((tool) => (
          <button
            key={tool.command}
            type="button"
            className={cx(styles.toolButton, tool.className)}
            aria-label={tool.label}
            title={tool.label}
            aria-controls={id}
            onClick={() => {
              run(tool.command)
            }}
          >
            {tool.glyph}
          </button>
        ))}
        <span className={styles.counters}>
          <span>{plural(lineCount, 'ligne', 'lignes')}</span>
          <span>≈ {formatInteger(estimateTokens(value))} tokens</span>
        </span>
      </div>
      <div className={styles.split}>
        <div className={styles.source}>
          {value !== '' && (
            <div className={styles.highlights} aria-hidden="true">
              {lines.map((line) => (
                <div
                  key={line}
                  className={cx(styles.highlightLine, flaggedLines.has(line) && styles.flagged)}
                />
              ))}
            </div>
          )}
          <div className={styles.sourceGrid}>
            {value !== '' && (
              <div className={styles.gutter} aria-hidden="true">
                {lines.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
            <label htmlFor={id} className="visually-hidden">
              Contenu Markdown du contexte
            </label>
            <textarea
              ref={textareaRef}
              id={id}
              className={cx(styles.textarea, value === '' && styles.textareaEmpty)}
              value={value}
              placeholder={PLACEHOLDER}
              spellCheck={false}
              wrap="off"
              rows={Math.max(lineCount, 1)}
              aria-describedby={describedBy}
              onChange={(event) => {
                onChange(event.target.value)
              }}
            />
          </div>
        </div>
        <div className={styles.preview} role="region" aria-label="Aperçu">
          {preview.trim() === '' ? (
            <p className={styles.previewEmpty}>L’aperçu s’affiche ici.</p>
          ) : (
            <MarkdownView content={preview} variant="compact" />
          )}
        </div>
      </div>
    </section>
  )
}
