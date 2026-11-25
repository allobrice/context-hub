/**
 * Worker des tests de concurrence des Workspaces (`runConcurrently`) : une opération du store, sur
 * sa propre connexion, lancée en même temps que les autres workers.
 */
import { toUserId } from '../application/viewer.ts'
import type { AppDatabase } from '../infrastructure/db/connection.ts'
import { DrizzleWorkspaceStore } from '../infrastructure/db/stores/DrizzleWorkspaceStore.ts'
import { serveConcurrentTask } from './concurrency/serveConcurrentTask.ts'

export type WorkspaceOperation =
  | { readonly kind: 'claim'; readonly session: string; readonly area: string }
  | { readonly kind: 'post'; readonly session: string; readonly count: number }
  | { readonly kind: 'read'; readonly expected: number; readonly pageSize: number }

export type WorkerTask = WorkspaceOperation & {
  readonly workspaceId: string
  readonly at: string
}

export type WorkerResult =
  | { readonly kind: 'claim'; readonly outcome: string }
  | { readonly kind: 'post'; readonly seqs: readonly number[] }
  | { readonly kind: 'read'; readonly seqs: readonly number[] }

export function isWorkerResult(value: unknown): value is WorkerResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'claim' || value.kind === 'post' || value.kind === 'read')
  )
}

function isWorkerTask(value: unknown): value is WorkerTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    'workspaceId' in value &&
    'at' in value
  )
}

async function execute(db: AppDatabase, task: WorkerTask): Promise<WorkerResult> {
  const store = new DrizzleWorkspaceStore(db)
  const at = new Date(task.at)
  switch (task.kind) {
    case 'claim': {
      const result = await store.acquireClaim({
        workspaceId: task.workspaceId,
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
          task.workspaceId,
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
        const slice = await store.readEntries(task.workspaceId, { since, limit: task.pageSize })
        for (const entry of slice.entries) seqs.push(entry.seq)
        const last = slice.entries.at(-1)
        if (last !== undefined) since = last.seq + 1
      }
      return { kind: 'read', seqs }
    }
  }
}

serveConcurrentTask(isWorkerTask, execute)
