/**
 * Worker de test de concurrence : SA PROPRE connexion SQLite sur le fichier partagé, puis une
 * opération du store, lancée en même temps que les autres workers (barrière `Atomics`).
 * Exécuté par `node:worker_threads` avec `--import tsx`.
 */
import { parentPort, workerData } from 'node:worker_threads'

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import { toUserId } from '../application/viewer.ts'
import * as schema from '../infrastructure/db/schema.ts'
import { DrizzleWorkspaceStore } from '../infrastructure/db/stores/DrizzleWorkspaceStore.ts'

export type WorkerTask =
  | { readonly kind: 'claim'; readonly session: string; readonly area: string }
  | { readonly kind: 'post'; readonly session: string; readonly count: number }
  | { readonly kind: 'read'; readonly expected: number; readonly pageSize: number }

export interface WorkerInput {
  readonly filename: string
  readonly workspaceId: string
  readonly at: string
  /** [0] : workers prêts ; [1] : départ (0 tant que le test n'a pas donné le signal). */
  readonly barrier: SharedArrayBuffer
  readonly task: WorkerTask
}

export type WorkerResult =
  | { readonly kind: 'claim'; readonly outcome: string }
  | { readonly kind: 'post'; readonly seqs: readonly number[] }
  | { readonly kind: 'read'; readonly seqs: readonly number[] }
  | { readonly kind: 'error'; readonly message: string }

function isWorkerInput(value: unknown): value is WorkerInput {
  return typeof value === 'object' && value !== null && 'filename' in value && 'task' in value
}

async function run(input: WorkerInput): Promise<WorkerResult> {
  const client = new Database(input.filename)
  client.pragma('busy_timeout = 20000')
  client.pragma('foreign_keys = ON')
  const store = new DrizzleWorkspaceStore(drizzle({ client, schema }))
  const at = new Date(input.at)
  const flags = new Int32Array(input.barrier)
  Atomics.add(flags, 0, 1)
  Atomics.wait(flags, 1, 0)
  try {
    const { task } = input
    switch (task.kind) {
      case 'claim': {
        const result = await store.acquireClaim({
          workspaceId: input.workspaceId,
          id: `claim-${task.session}`,
          session: {
            userId: toUserId('brice'),
            sessionLabel: task.session,
            repo: 'allovoisins/front',
          },
          repo: 'allovoisins/front',
          area: task.area,
          ttlMinutes: 30,
          at,
          announce: (claim) => ({
            kind: 'system',
            body: `${claim.holder.sessionLabel} a réservé ${claim.area}`,
            files: [],
            author: { system: 'claim' },
            redactions: 0,
            suspicious: false,
          }),
          expired: () => {
            throw new Error('aucun claim expiré attendu')
          },
        })
        return { kind: 'claim', outcome: result.kind }
      }
      case 'post': {
        const seqs: number[] = []
        for (let index = 0; index < task.count; index += 1) {
          const result = await store.appendEntry(
            input.workspaceId,
            {
              kind: 'note',
              body: `${task.session} #${index}`,
              files: [],
              author: { userId: toUserId('brice'), sessionLabel: task.session, repo: null },
              redactions: 0,
              suspicious: false,
            },
            at,
            null,
          )
          if (result.kind === 'appended') seqs.push(result.entry.seq)
        }
        return { kind: 'post', seqs }
      }
      case 'read': {
        // Lecture par curseur PENDANT les écritures, jusqu'à avoir vu toutes les entrées attendues.
        const seqs: number[] = []
        let since = 1
        const deadline = Date.now() + 20_000
        while (seqs.length < task.expected && Date.now() < deadline) {
          const slice = await store.readEntries(input.workspaceId, { since, limit: task.pageSize })
          for (const entry of slice.entries) seqs.push(entry.seq)
          const last = slice.entries.at(-1)
          if (last !== undefined) since = last.seq + 1
        }
        return { kind: 'read', seqs }
      }
    }
  } finally {
    client.close()
  }
}

if (parentPort && isWorkerInput(workerData)) {
  const port = parentPort
  run(workerData).then(
    (result) => {
      port.postMessage(result)
    },
    (error: unknown) => {
      port.postMessage({
        kind: 'error',
        message: error instanceof Error ? error.message : 'inconnue',
      })
    },
  )
}
