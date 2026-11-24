/**
 * Support de test HTTP : l'app complète (composition.ts) sur une base en mémoire seedée, avec un
 * journal capturé (pour vérifier qu'aucun contenu n'y fuit) et des helpers de requête authentifiée.
 */
import { toContextId, type ContextId } from '@context-hub/domain/context/types.ts'

import { hashApiToken } from '../application/auth/apiToken.ts'
import type { Clock } from '../application/ports/Clock.ts'
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
  /** `fetch` en process vers l'app (avec un Host local), pour le client MCP du SDK. */
  readonly fetch: (input: string | URL, init?: RequestInit) => Promise<Response>
  readonly mcp: ReturnType<typeof composeServer>['mcp']
  /** Cas d'usage des workspaces (fermeture automatique, appelée par le job de `main.ts`). */
  readonly workspaces: ReturnType<typeof composeServer>['workspaces']
  close(): Promise<void>
}

let sequence = 0

/** Identifiants prévisibles pour les contextes créés pendant un test. */
function sequentialId(): ContextId {
  sequence += 1
  return toContextId(`ctx-test-${sequence}`)
}

export interface TestAppOptions {
  /** Horloge injectée (ex. `ManualClock`) ; défaut : figée sur `DEMO_NOW`. */
  readonly clock?: Clock
}

let workspaceSequence = 0

/** Identifiants prévisibles pour les workspaces et claims créés pendant un test. */
function sequentialWorkspaceId(prefix: 'ws' | 'claim'): string {
  workspaceSequence += 1
  return `${prefix}-test-${workspaceSequence}`
}

export async function createTestApp({ clock }: TestAppOptions = {}): Promise<TestApp> {
  const database = createTestDatabase(clock ? { clock } : {})
  await database.users.createToken({
    userId: toUserId('camille'),
    tokenHash: hashApiToken(CAMILLE_TOKEN),
    label: 'Test',
    at: database.clock.now(),
  })
  const { logger, logs } = captureLogger()
  const { app, mcp, workspaces } = composeServer(database.db, {
    clock: database.clock,
    logger,
    webOrigin: WEB_ORIGIN,
    workspaceName: 'Espace AlloVoisins',
    allowedHosts: ['localhost', '127.0.0.1'],
    newContextId: sequentialId,
    newWorkspaceId: sequentialWorkspaceId,
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
    fetch: (input, init) => {
      const url = new URL(input)
      const headers = new Headers(init?.headers)
      headers.set('host', url.host)
      return Promise.resolve(app.request(url.href, { ...init, headers }))
    },
    mcp,
    workspaces,
    close: async () => {
      await mcp.close()
      database.close()
    },
  }
}
