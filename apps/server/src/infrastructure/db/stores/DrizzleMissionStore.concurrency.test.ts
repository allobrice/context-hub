/**
 * Concurrence RÉELLE des prises de mission (SPEC §8.2, « une seule session gagne ») : chaque `take`
 * tourne dans un worker avec sa propre connexion SQLite sur un même fichier (WAL), et tous partent
 * ensemble (voir `test/concurrency/runConcurrently.ts`).
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { failuresOf, runConcurrently } from '../../../test/concurrency/runConcurrently.ts'
import { MISSION_NOW, readyMission } from '../../../test/missionFixtures.ts'
import {
  isMissionTaskResult,
  type MissionTask,
  type MissionTaskResult,
} from '../../../test/missionWorker.ts'
import { openDatabase } from '../connection.ts'
import { users } from '../schema.ts'
import { DrizzleMissionStore } from './DrizzleMissionStore.ts'

const WORKER = new URL('../../../test/missionWorker.ts', import.meta.url)
const SESSIONS = Array.from({ length: 10 }, (_, index) => `web-${String(index + 1)}`)

let directory: string
let filename: string

async function seedMissions(slugs: readonly string[]): Promise<void> {
  const { db, close } = openDatabase(filename)
  try {
    db.insert(users).values({ id: 'brice', name: 'Brice' }).run()
    const store = new DrizzleMissionStore(db)
    for (const slug of slugs) {
      const { mission, event } = readyMission(slug)
      await store.create(mission, event)
    }
  } finally {
    close()
  }
}

function takeTogether(slug: string | null) {
  const tasks: MissionTask[] = SESSIONS.map((session) => ({
    session,
    slug,
    at: MISSION_NOW.toISOString(),
  }))
  return runConcurrently({ worker: WORKER, filename, tasks, isResult: isMissionTaskResult })
}

function outcomes(results: readonly unknown[]): MissionTaskResult[] {
  return results.filter(isMissionTaskResult)
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'context-hub-missions-'))
  filename = join(directory, 'concurrency.db')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('DrizzleMissionStore en concurrence (workers, une connexion chacun)', () => {
  it('10 take simultanés sur la même mission : exactement 1 succès', async () => {
    await seedMissions(['lcp-home'])
    const results = await takeTogether('lcp-home')
    expect(failuresOf(results)).toEqual([])
    const taken = outcomes(results).filter((result) => result.outcome === 'taken')
    const refused = outcomes(results).filter((result) => result.outcome === 'refused')
    expect(taken).toHaveLength(1)
    expect(refused).toHaveLength(9)
  }, 120_000)

  it('10 next simultanés sur 3 missions prêtes : 3 succès distincts, 7 « file vide »', async () => {
    await seedMissions(['mission-a', 'mission-b', 'mission-c'])
    const results = await takeTogether(null)
    expect(failuresOf(results)).toEqual([])
    const taken = outcomes(results).filter((result) => result.outcome === 'taken')
    expect(taken.map((result) => result.slug).sort()).toEqual([
      'mission-a',
      'mission-b',
      'mission-c',
    ])
    expect(outcomes(results).filter((result) => result.outcome === 'empty')).toHaveLength(7)
  }, 120_000)
})
