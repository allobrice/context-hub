export type MarkdownCommand = 'heading' | 'bold' | 'italic' | 'code' | 'list' | 'link'

export interface TextSelection {
  readonly value: string
  readonly start: number
  readonly end: number
}

const PLACEHOLDERS: Readonly<Record<'bold' | 'italic' | 'code' | 'link', string>> = {
  bold: 'texte',
  italic: 'texte',
  code: 'code',
  link: 'texte du lien',
}

function wrap(
  { value, start, end }: TextSelection,
  before: string,
  after: string,
  placeholder: string,
): TextSelection {
  const selected = value.slice(start, end) || placeholder
  const next = value.slice(0, start) + before + selected + after + value.slice(end)
  return { value: next, start: start + before.length, end: start + before.length + selected.length }
}

/** Préfixe chaque ligne touchée par la sélection. */
function prefixLines({ value, start, end }: TextSelection, prefix: string): TextSelection {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1
  const block = value.slice(lineStart, end)
  const prefixed = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join('\n')
  const next = value.slice(0, lineStart) + prefixed + value.slice(end)
  return { value: next, start: lineStart, end: lineStart + prefixed.length }
}

/** Applique une commande de la barre d'outils à la sélection du textarea (fonction pure). */
export function applyMarkdownCommand(
  selection: TextSelection,
  command: MarkdownCommand,
): TextSelection {
  const selected = selection.value.slice(selection.start, selection.end)
  switch (command) {
    case 'heading':
      return prefixLines(selection, '## ')
    case 'list':
      return prefixLines(selection, '- ')
    case 'bold':
      return wrap(selection, '**', '**', PLACEHOLDERS.bold)
    case 'italic':
      return wrap(selection, '_', '_', PLACEHOLDERS.italic)
    case 'code':
      return selected.includes('\n')
        ? wrap(selection, '```\n', '\n```', PLACEHOLDERS.code)
        : wrap(selection, '`', '`', PLACEHOLDERS.code)
    case 'link': {
      const label = selected || PLACEHOLDERS.link
      const url = 'https://'
      const inserted = `[${label}](${url})`
      const value =
        selection.value.slice(0, selection.start) + inserted + selection.value.slice(selection.end)
      const urlStart = selection.start + label.length + 3
      return { value, start: urlStart, end: urlStart + url.length }
    }
  }
}
