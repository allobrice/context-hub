/**
 * Concurrence RÉELLE pour les tests de store : un worker par tâche, chacun avec SA connexion SQLite
 * sur un même fichier (WAL), tous libérés ensemble par une barrière `Atomics`. Dans un seul thread,
 * better-sqlite3 étant synchrone, des appels « concurrents » s'exécuteraient l'un après l'autre et
 * ne prouveraient rien.
 */
import { Worker } from 'node:worker_threads'

/** Données transmises à chaque worker (voir `serveConcurrentTask`). */
export interface WorkerEnvelope<TTask> {
  readonly filename: string
  /** [0] : workers prêts ; [1] : départ (0 tant que le test n'a pas donné le signal). */
  readonly barrier: SharedArrayBuffer
  readonly task: TTask
}

/** Une exception levée dans le worker, rapportée au test au lieu d'un résultat. */
export interface WorkerFailure {
  readonly kind: 'error'
  readonly message: string
}

export interface ConcurrentRun<TTask, TResult> {
  /** Module du worker (il appelle `serveConcurrentTask`). */
  readonly worker: URL
  /** Fichier SQLite partagé (pas `:memory:`, propre à chaque connexion). */
  readonly filename: string
  readonly tasks: readonly TTask[]
  readonly isResult: (value: unknown) => value is TResult
}

const READY_TIMEOUT_MS = 90_000

export function isWorkerFailure(value: unknown): value is WorkerFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    value.kind === 'error' &&
    'message' in value &&
    typeof value.message === 'string'
  )
}

/** Messages des workers en échec (vide si tous ont rendu un résultat). */
export function failuresOf(results: readonly unknown[]): string[] {
  return results.flatMap((result) => (isWorkerFailure(result) ? [result.message] : []))
}

/** Lance un worker par tâche, attend qu'ils soient tous prêts, puis les libère ensemble. */
export async function runConcurrently<TTask, TResult>(
  run: ConcurrentRun<TTask, TResult>,
): Promise<(TResult | WorkerFailure)[]> {
  const barrier = new SharedArrayBuffer(8)
  const flags = new Int32Array(barrier)
  const workers = run.tasks.map((task) => {
    const workerData: WorkerEnvelope<TTask> = { filename: run.filename, barrier, task }
    return new Worker(run.worker, { workerData, execArgv: ['--import', 'tsx'] })
  })
  const results = workers.map(
    (worker) =>
      new Promise<TResult | WorkerFailure>((resolve, reject) => {
        worker.once('message', (message: unknown) => {
          if (isWorkerFailure(message) || run.isResult(message)) resolve(message)
          else reject(new Error('message de worker inattendu'))
        })
        worker.once('error', reject)
      }),
  )
  try {
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Atomics.load(flags, 0) < run.tasks.length) {
      if (Date.now() > deadline) throw new Error('workers non prêts')
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    Atomics.store(flags, 1, 1)
    Atomics.notify(flags, 1)
    return await Promise.all(results)
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()))
  }
}
