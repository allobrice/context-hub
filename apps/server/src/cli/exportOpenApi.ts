/**
 * `pnpm --filter @context-hub/server openapi:export` : écrit le contrat OpenAPI dans
 * `apps/server/openapi.json`, source des types générés du front (sans démarrer le serveur).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { systemClock } from '../application/ports/Clock.ts'
import { composeServer } from '../composition.ts'
import { MEMORY_DATABASE, openDatabase } from '../infrastructure/db/connection.ts'
import { consoleLogger } from '../infrastructure/logging/jsonLogger.ts'
import { OPENAPI_DOCUMENT } from '../interfaces/http/app.ts'

const OUTPUT = fileURLToPath(new URL('../../openapi.json', import.meta.url))

const database = openDatabase(MEMORY_DATABASE)
try {
  const { app } = composeServer(database.db, {
    clock: systemClock,
    logger: consoleLogger,
    webOrigin: 'http://localhost',
    workspaceName: 'export',
  })
  const document = app.getOpenAPI31Document(OPENAPI_DOCUMENT)
  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`)
  console.info(`Contrat OpenAPI écrit : ${OUTPUT}`)
} finally {
  database.close()
}
