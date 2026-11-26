/**
 * Support de test : base SQLite en mémoire, migrée et seedée avec les fixtures, horloge figée sur
 * le « maintenant » des maquettes. Seul `src/test/` assemble l'infrastructure pour les tests.
 */
import { DEMO_NOW } from '@context-hub/domain/fixtures/now.ts'

import type { Clock } from '../application/ports/Clock.ts'
import { toUserId, type Viewer } from '../application/viewer.ts'
import { MEMORY_DATABASE, openDatabase, type AppDatabase } from '../infrastructure/db/connection.ts'
import { Fts5SearchIndex } from '../infrastructure/db/search/Fts5SearchIndex.ts'
import { seedDemoData } from '../infrastructure/db/seed/seedDemoData.ts'
import { DrizzleContextStore } from '../infrastructure/db/stores/DrizzleContextStore.ts'
import { DrizzleMcpReadLog } from '../infrastructure/db/stores/DrizzleMcpReadLog.ts'
import { DrizzleTaxonomyStore } from '../infrastructure/db/stores/DrizzleTaxonomyStore.ts'
import { DrizzleUserStore } from '../infrastructure/db/stores/DrizzleUserStore.ts'

/** Jeton du seed de test : connu des tests, jamais utilisé hors d'une base en mémoire. */
export const TEST_TOKEN = 'chub_test-token-for-in-memory-databases-only'

export const BRICE: Viewer = { userId: toUserId('brice') }
export const CAMILLE: Viewer = { userId: toUserId('camille') }

export interface TestDatabase {
  readonly db: AppDatabase
  readonly clock: Clock
  readonly searchIndex: Fts5SearchIndex
  readonly contexts: DrizzleContextStore
  readonly taxonomy: DrizzleTaxonomyStore
  readonly users: DrizzleUserStore
  readonly mcpReads: DrizzleMcpReadLog
  readonly close: () => void
}

export interface TestDatabaseOptions {
  readonly seed?: boolean
  /** Horloge injectée (ex. `ManualClock`) ; défaut : figée sur `DEMO_NOW`. */
  readonly clock?: Clock
  /** Missions de démo (défaut : oui) ; `false` pour partir d'une file vide. */
  readonly demoMissions?: boolean
}

export function createTestDatabase({
  seed = true,
  clock: injected,
  demoMissions = true,
}: TestDatabaseOptions = {}): TestDatabase {
  const { db, close } = openDatabase(MEMORY_DATABASE)
  const clock: Clock = injected ?? { now: () => new Date(DEMO_NOW) }
  const searchIndex = new Fts5SearchIndex()
  if (seed) {
    seedDemoData(db, { now: clock.now(), searchIndex, token: TEST_TOKEN, missions: demoMissions })
  }
  return {
    db,
    clock,
    searchIndex,
    contexts: new DrizzleContextStore(db, searchIndex, clock),
    taxonomy: new DrizzleTaxonomyStore(db, searchIndex),
    users: new DrizzleUserStore(db),
    mcpReads: new DrizzleMcpReadLog(db),
    close,
  }
}
