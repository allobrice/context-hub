/**
 * Garde-fou : le journal du cycle de vie des missions est append-only (SPEC §8.1). Aucun code serveur
 * ne fait d'UPDATE ni de DELETE sur `mission_events` ; les triggers de la migration 0006 l'interdisent
 * aussi en base.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { MEMORY_DATABASE, openDatabase } from '../../src/infrastructure/db/connection.ts'
import { missionEvents } from '../../src/infrastructure/db/schema.ts'

const ROOT = join(import.meta.dirname, '../..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

/** Message de l'erreur SQLite, que Drizzle enveloppe dans `cause`. */
function sqliteFailure(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined
    return cause instanceof Error ? cause.message : String(error)
  }
  return 'aucune erreur'
}

const EVENT_MUTATION =
  /\.(?:update|delete)\(\s*missionEvents\s*\)|(?:UPDATE|DELETE\s+FROM)\s+[`"]?mission_events/i

describe('mission_events', () => {
  it('n’est jamais modifié ni supprimé par le code serveur', () => {
    const offenders = sourceFiles(join(ROOT, 'src'))
      .filter((file) => EVENT_MUTATION.test(readFileSync(file, 'utf8')))
      .map((file) => relative(ROOT, file))
    expect(offenders).toEqual([])
  })

  it('refuse UPDATE et DELETE en base (triggers)', () => {
    const { db, close } = openDatabase(MEMORY_DATABASE)
    try {
      db.insert(missionEvents)
        .values({
          missionId: 'm-1',
          missionSlug: 'm-1',
          missionTitle: 'M',
          at: '2026-11-25T10:00:00.000Z',
          type: 'created',
          actorSystem: 'job',
        })
        .run()
      expect(sqliteFailure(() => db.run(sql`UPDATE mission_events SET detail = 'x'`))).toMatch(
        /append-only/,
      )
      expect(sqliteFailure(() => db.run(sql`DELETE FROM mission_events`))).toMatch(/append-only/)
    } finally {
      close()
    }
  })
})
