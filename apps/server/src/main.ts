/** Démarrage du serveur : configuration, base (migrée), composition, écoute HTTP. */
import { serve } from '@hono/node-server'

import { runMaintenance } from './application/maintenance.ts'
import { systemClock } from './application/ports/Clock.ts'
import { composeServer } from './composition.ts'
import { databasePath } from './infrastructure/db/cli/databasePath.ts'
import { readServerConfig } from './infrastructure/config/env.ts'
import { openDatabase } from './infrastructure/db/connection.ts'
import { consoleLogger } from './infrastructure/logging/jsonLogger.ts'

const config = readServerConfig()
const database = openDatabase(databasePath())
const { app, mcp, maintenance } = composeServer(database.db, {
  clock: systemClock,
  logger: consoleLogger,
  webOrigin: config.webOrigin,
  workspaceName: config.workspaceName,
  allowedHosts: config.allowedHosts,
})

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  consoleLogger.info('server.listening', { url: `http://${info.address}:${info.port}` })
})

/**
 * Maintenance au démarrage puis toutes les heures (fermeture des workspaces inactifs, purge des claims
 * expirés…). La libération des réservations expirées ne dépend pas de cette boucle : elle est aussi
 * faite dans la transaction des écritures concernées.
 */
const MAINTENANCE_INTERVAL_MS = 60 * 60 * 1000

void runMaintenance(maintenance, consoleLogger)
const maintenanceTimer = setInterval(
  () => void runMaintenance(maintenance, consoleLogger),
  MAINTENANCE_INTERVAL_MS,
)
maintenanceTimer.unref()

function shutdown(): void {
  clearInterval(maintenanceTimer)
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
