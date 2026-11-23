/**
 * Point de composition : instancie stores, cas d'usage et interfaces sur une base ouverte.
 * Partagé par `main.ts`, les CLI et le support de test, pour un seul câblage.
 */
import { randomUUID } from 'node:crypto'

import { toContextId, type ContextId } from '@context-hub/domain/context/types.ts'

import { AuthService } from './application/auth/AuthService.ts'
import { ContextService } from './application/contexts/ContextService.ts'
import type { Clock } from './application/ports/Clock.ts'
import type { Logger } from './application/ports/Logger.ts'
import { TaxonomyService } from './application/taxonomy/TaxonomyService.ts'
import { WorkspaceService } from './application/workspace/WorkspaceService.ts'
import type { AppDatabase } from './infrastructure/db/connection.ts'
import { Fts5SearchIndex } from './infrastructure/db/search/Fts5SearchIndex.ts'
import { DrizzleContextStore } from './infrastructure/db/stores/DrizzleContextStore.ts'
import { DrizzleTaxonomyStore } from './infrastructure/db/stores/DrizzleTaxonomyStore.ts'
import { DrizzleUserStore } from './infrastructure/db/stores/DrizzleUserStore.ts'
import { createHttpApp } from './interfaces/http/app.ts'

export interface CompositionOptions {
  readonly clock: Clock
  readonly logger: Logger
  readonly webOrigin: string
  readonly workspaceName: string
  readonly newContextId?: () => ContextId
}

const newContextId = (): ContextId => toContextId(`ctx-${randomUUID()}`)

export function composeServer(db: AppDatabase, options: CompositionOptions) {
  const searchIndex = new Fts5SearchIndex()
  const contextStore = new DrizzleContextStore(db, searchIndex, options.clock)
  const taxonomyStore = new DrizzleTaxonomyStore(db, searchIndex)
  const contexts = new ContextService({
    store: contextStore,
    clock: options.clock,
    newId: options.newContextId ?? newContextId,
  })
  const app = createHttpApp({
    auth: new AuthService(new DrizzleUserStore(db), options.clock),
    contexts,
    taxonomy: new TaxonomyService(taxonomyStore, options.clock),
    workspace: new WorkspaceService(contextStore, taxonomyStore, options.workspaceName),
    logger: options.logger,
    webOrigin: options.webOrigin,
  })
  return { app, contexts }
}
