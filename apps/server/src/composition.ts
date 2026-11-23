/**
 * Point de composition : instancie stores, cas d'usage et interfaces sur une base ouverte.
 * Partagé par `main.ts`, les CLI et le support de test, pour un seul câblage.
 */
import { randomUUID } from 'node:crypto'

import { toContextId, type ContextId } from '@context-hub/domain/context/types.ts'

import { AuthService } from './application/auth/AuthService.ts'
import { ContextService } from './application/contexts/ContextService.ts'
import { ContextCatalog } from './application/mcp/ContextCatalog.ts'
import type { Clock } from './application/ports/Clock.ts'
import type { Logger } from './application/ports/Logger.ts'
import { TaxonomyService } from './application/taxonomy/TaxonomyService.ts'
import { WorkspaceService } from './application/workspace/WorkspaceService.ts'
import type { AppDatabase } from './infrastructure/db/connection.ts'
import { Fts5SearchIndex } from './infrastructure/db/search/Fts5SearchIndex.ts'
import { DrizzleContextStore } from './infrastructure/db/stores/DrizzleContextStore.ts'
import { DrizzleMcpReadLog } from './infrastructure/db/stores/DrizzleMcpReadLog.ts'
import { DrizzleTaxonomyStore } from './infrastructure/db/stores/DrizzleTaxonomyStore.ts'
import { DrizzleUserStore } from './infrastructure/db/stores/DrizzleUserStore.ts'
import { InProcessContextEvents } from './infrastructure/events/InProcessContextEvents.ts'
import { createHttpApp } from './interfaces/http/app.ts'
import { mountMcp } from './interfaces/mcp/mountMcp.ts'

export interface CompositionOptions {
  readonly clock: Clock
  readonly logger: Logger
  readonly webOrigin: string
  readonly workspaceName: string
  /** Noms d'hôte acceptés dans `Host` sur /mcp (protection contre le DNS rebinding). */
  readonly allowedHosts: readonly string[]
  readonly newContextId?: () => ContextId
}

/** Origines locales, plus celle du front : les autres sont refusées sur /mcp (403). */
function allowedOrigins(webOrigin: string): string[] {
  return ['localhost', '127.0.0.1', '[::1]', new URL(webOrigin).hostname]
}

const newContextId = (): ContextId => toContextId(`ctx-${randomUUID()}`)

export function composeServer(db: AppDatabase, options: CompositionOptions) {
  const searchIndex = new Fts5SearchIndex()
  const contextStore = new DrizzleContextStore(db, searchIndex, options.clock)
  const taxonomyStore = new DrizzleTaxonomyStore(db, searchIndex)
  const events = new InProcessContextEvents((error) => {
    options.logger.error('events.listener_error', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  })
  const auth = new AuthService(new DrizzleUserStore(db), options.clock)
  const contexts = new ContextService({
    store: contextStore,
    clock: options.clock,
    newId: options.newContextId ?? newContextId,
    events,
  })
  const app = createHttpApp({
    auth,
    contexts,
    taxonomy: new TaxonomyService(taxonomyStore, options.clock),
    workspace: new WorkspaceService(contextStore, taxonomyStore, options.workspaceName),
    logger: options.logger,
    webOrigin: options.webOrigin,
  })
  const mcp = mountMcp(app, {
    auth,
    catalog: new ContextCatalog(contextStore, new DrizzleMcpReadLog(db), options.clock),
    events,
    logger: options.logger,
    allowedHosts: options.allowedHosts,
    allowedOrigins: allowedOrigins(options.webOrigin),
  })
  return { app, mcp }
}
