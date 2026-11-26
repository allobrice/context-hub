/**
 * Côté worker de `runConcurrently` : ouvre SA connexion SQLite sur le fichier partagé, se déclare
 * prêt, attend le signal de départ commun, exécute la tâche et rend son résultat (ou l'erreur).
 */
import { parentPort, workerData } from 'node:worker_threads'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import type { AppDatabase } from '../../infrastructure/db/connection.ts'
import * as schema from '../../infrastructure/db/schema.ts'
import type { WorkerEnvelope, WorkerFailure } from './runConcurrently.ts'

function isEnvelope<TTask>(
  value: unknown,
  isTask: (task: unknown) => task is TTask,
): value is WorkerEnvelope<TTask> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'filename' in value &&
    typeof value.filename === 'string' &&
    'barrier' in value &&
    value.barrier instanceof SharedArrayBuffer &&
    'task' in value &&
    isTask(value.task)
  )
}

async function serve<TTask, TResult>(
  envelope: WorkerEnvelope<TTask>,
  execute: (db: AppDatabase, task: TTask) => Promise<TResult>,
): Promise<TResult> {
  const client = new Database(envelope.filename)
  client.pragma('busy_timeout = 20000')
  client.pragma('foreign_keys = ON')
  const flags = new Int32Array(envelope.barrier)
  Atomics.add(flags, 0, 1)
  Atomics.wait(flags, 1, 0)
  try {
    return await execute(drizzle({ client, schema }), envelope.task)
  } finally {
    client.close()
  }
}

/** À appeler au niveau du module du worker. */
export function serveConcurrentTask<TTask, TResult>(
  isTask: (task: unknown) => task is TTask,
  execute: (db: AppDatabase, task: TTask) => Promise<TResult>,
): void {
  const port = parentPort
  if (port === null || !isEnvelope(workerData, isTask)) return
  serve(workerData, execute).then(
    (result) => {
      port.postMessage(result)
    },
    (error: unknown) => {
      const failure: WorkerFailure = {
        kind: 'error',
        message: error instanceof Error ? error.message : 'inconnue',
      }
      port.postMessage(failure)
    },
  )
}
