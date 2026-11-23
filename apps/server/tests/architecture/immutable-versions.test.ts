/**
 * Garde-fou : une version publiée est immuable (SPEC §2). Aucun code serveur ne fait d'UPDATE sur
 * `context_versions` ; le trigger de la migration 0001 l'interdit aussi en base.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(import.meta.dirname, '../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

const VERSION_UPDATE = /\.update\(\s*contextVersions\s*\)|UPDATE\s+[`"]?context_versions/i

describe('context_versions', () => {
  it('n’est jamais mis à jour par le code serveur', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((file) => VERSION_UPDATE.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('est protégé par un trigger dans les migrations', () => {
    const migrations = readdirSync(join(ROOT, 'drizzle')).filter((name) => name.endsWith('.sql'))
    const sql = migrations
      .map((name) => readFileSync(join(ROOT, 'drizzle', name), 'utf8'))
      .join('\n')
    expect(sql).toMatch(/BEFORE UPDATE ON `context_versions`[\s\S]*RAISE\(ABORT/)
  })
})
