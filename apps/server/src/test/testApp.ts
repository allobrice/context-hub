/**
 * Support de test HTTP : l'app complète (composition.ts) sur une base en mémoire seedée, avec un
 * journal capturé (pour vérifier qu'aucun contenu n'y fuit) et des helpers de requête authentifiée.
 */
import { toContextId, type ContextId } from '@context-hub/domain/context/types.ts'

import { hashApiToken } from '../application/auth/apiToken.ts'
import type { LogFields, Logger } from '../application/ports/Logger.ts'
import { toUserId } from '../application/viewer.ts'
import { composeServer } from '../composition.ts'
import { createTestDatabase, TEST_TOKEN, type TestDatabase } from './testDatabase.ts'

export const WEB_ORIGIN = 'http://localhost:5173'
/** Jeton de Camille, créé par `createTestApp` : pour vérifier les portées entre utilisateurs. */
export const CAMILLE_TOKEN = 'chub_camille-test-token-for-in-memory-databases-only'

export interface CapturedLog {
  readonly level: 'info' | 'error'
  readonly event: string
  readonly fields: LogFields
}

export function captureLogger(): { logger: Logger; logs: CapturedLog[] } {
  const logs: CapturedLog[] = []
  return {
    logs,
    logger: {
      info: (event, fields = {}) => logs.push({ level: 'info', event, fields }),
      error: (event, fields = {}) => logs.push({ level: 'error', event, fields }),
    },
  }
}

export interface RequestOptions {
  readonly method?: string
  readonly body?: unknown
  /** Corps brut, envoyé tel quel (ex. JSON malformé). */
  readonly rawBody?: string
  /** Jeton Bearer ; null pour une requête anonyme. Défaut : jeton de Brice. */
  readonly token?: string | null
  readonly headers?: Record<string, string>
}

export interface TestApp {
  readonly database: TestDatabase
  readonly logs: CapturedLog[]
  request(path: string, options?: RequestOptions): Promise<Response>
  close(): void
}

let sequence = 0

/** Identifiants prévisibles pour les contextes créés pendant un test. */
function sequentialId(): ContextId {
  sequence += 1
  return toContextId(`ctx-test-${sequence}`)
}

export async function createTestApp(): Promise<TestApp> {
  const database = createTestDatabase()
  await database.users.createToken({
    userId: toUserId('camille'),
    tokenHash: hashApiToken(CAMILLE_TOKEN),
    label: 'Test',
    at: database.clock.now(),
  })
  const { logger, logs } = captureLogger()
  const { app } = composeServer(database.db, {
    clock: database.clock,
    logger,
    webOrigin: WEB_ORIGIN,
    workspaceName: 'Espace AlloVoisins',
    newContextId: sequentialId,
  })
  return {
    database,
    logs,
    request: (path, { method = 'GET', body, rawBody, token = TEST_TOKEN, headers = {} } = {}) => {
      const payload = rawBody ?? (body === undefined ? undefined : JSON.stringify(body))
      const init: RequestInit = {
        method,
        headers: {
          ...(token === null ? {} : { Authorization: `Bearer ${token}` }),
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...headers,
        },
        ...(payload === undefined ? {} : { body: payload }),
      }
      return Promise.resolve(app.request(path, init))
    },
    close: () => {
      database.close()
    },
  }
}
