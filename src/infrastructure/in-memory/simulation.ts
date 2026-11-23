import { RepositoryUnavailableError } from '../../application/errors.ts'
import type { MockMode } from './mockMode.ts'

export interface SimulationOptions {
  /** Mode courant, relu à chaque appel : l'URL peut changer pendant la session. */
  readonly mode: () => MockMode
  /** Latence normale en ms (0 en test). */
  readonly latencyMs: number
  /** Latence du mode `slow`. */
  readonly slowLatencyMs: number
}

export const DEFAULT_SIMULATION: SimulationOptions = {
  mode: () => 'normal',
  latencyMs: 250,
  slowLatencyMs: 1500,
}

const never = <T>(): Promise<T> => new Promise<T>(() => undefined)

const delay = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))

/** Erreur des maquettes 06 (bibliothèque) : stockage verrouillé. */
export function storageBusyError(): RepositoryUnavailableError {
  return new RepositoryUnavailableError('SQLITE_BUSY', 'database is locked', '7f3a91')
}

/**
 * Exécute une lecture « principale » d'écran en appliquant le mode simulé :
 * `loading` ne répond jamais, `error` échoue, `slow` ralentit.
 */
export async function simulatePrimary<T>(options: SimulationOptions, run: () => T): Promise<T> {
  const mode = options.mode()
  if (mode === 'loading') return never<T>()
  await delay(mode === 'slow' ? options.slowLatencyMs : options.latencyMs)
  if (mode === 'error') throw storageBusyError()
  return run()
}

/** Lecture secondaire (navigation) : seule la latence s'applique, jamais d'erreur ni d'attente infinie. */
export async function simulateSecondary<T>(options: SimulationOptions, run: () => T): Promise<T> {
  await delay(options.latencyMs)
  return run()
}
