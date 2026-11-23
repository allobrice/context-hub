/**
 * Garde-fou CLAUDE.md : aucune couleur littérale hors du fichier de tokens.
 * Toute couleur passe par une custom property (`var(--…)`).
 */
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')
const STYLE_ROOT = join(ROOT, 'src')
const TOKENS_FILE = join(ROOT, 'src/ui/styles/base/_tokens.scss')

const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|lab|lch)\(|(?<![\w-])(?:white|black)(?![\w-])/i

function styleFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return styleFiles(path)
    return /\.(s?css|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('couleurs', () => {
  it('ne sont écrites en dur que dans les tokens', () => {
    const offenders = styleFiles(STYLE_ROOT)
      .filter((file) => file !== TOKENS_FILE)
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => !line.trim().startsWith('//') && COLOR_LITERAL.test(line))
          .map(({ index }) => `${relative(ROOT, file)}:${index + 1}`),
      )
    expect(offenders).toEqual([])
  })
})
