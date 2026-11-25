/**
 * Worker des tests de concurrence des Missions (`runConcurrently`) : un `take` (par slug ou `next`),
 * sur sa propre connexion, lancé en même temps que les autres workers.
 */
import { toUserId } from '../application/viewer.ts'
import type { AppDatabase } from '../infrastructure/db/connection.ts'
import { DrizzleMissionStore } from '../infrastructure/db/stores/DrizzleMissionStore.ts'
import { serveConcurrentTask } from './concurrency/serveConcurrentTask.ts'

export interface MissionTask {
  readonly session: string
  /** Un slug, ou null pour `next` (sans filtre). */
  readonly slug: string | null
  readonly at: string
}

export interface MissionTaskResult {
  readonly kind: 'take'
  readonly outcome: 'taken' | 'empty' | 'not-found' | 'refused'
  readonly slug: string | null
}

export function isMissionTaskResult(value: unknown): value is MissionTaskResult {
  return typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'take'
}

function isMissionTask(value: unknown): value is MissionTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    'session' in value &&
    typeof value.session === 'string' &&
    'slug' in value &&
    'at' in value &&
    typeof value.at === 'string'
  )
}

async function execute(db: AppDatabase, task: MissionTask): Promise<MissionTaskResult> {
  const result = await new DrizzleMissionStore(db).take({
    viewer: { userId: toUserId('brice') },
    target: task.slug === null ? { next: { tags: [], repo: null } } : { slug: task.slug },
    session: {
      userId: 'brice',
      userName: 'Brice',
      sessionLabel: task.session,
      repo: 'allovoisins/front',
    },
    tokenHash: `hash-${task.session}`,
    at: new Date(task.at),
  })
  return {
    kind: 'take',
    outcome: result.kind,
    slug: result.kind === 'taken' ? result.mission.slug : null,
  }
}

serveConcurrentTask(isMissionTask, execute)
