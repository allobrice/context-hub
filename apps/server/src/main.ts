/** Démarrage du serveur : configuration, base (migrée), composition, écoute HTTP. */
import { serve } from '@hono/node-server'

import { systemClock } from './application/ports/Clock.ts'
import { composeServer } from './composition.ts'
import { databasePath } from './infrastructure/db/cli/databasePath.ts'
import { readServerConfig } from './infrastructure/config/env.ts'
import { openDatabase } from './infrastructure/db/connection.ts'
import { consoleLogger } from './infrastructure/logging/jsonLogger.ts'

const config = readServerConfig()
const database = openDatabase(databasePath())
const { app, mcp } = composeServer(database.db, {
  clock: systemClock,
  logger: consoleLogger,
  webOrigin: config.webOrigin,
  workspaceName: config.workspaceName,
  allowedHosts: config.allowedHosts,
})

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  consoleLogger.info('server.listening', { url: `http://${info.address}:${info.port}` })
})

function shutdown(): void {
  // Ferme d'abord les sessions MCP (flux SSE ouverts), sinon `server.close` attendrait leur fin.
  void mcp.close().finally(() => {
    server.close(() => {
      database.close()
      process.exit(0)
    })
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
