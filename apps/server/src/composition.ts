/**
 * Point de composition : instancie stores, cas d'usage et interfaces sur une base ouverte.
 * Partagé par `main.ts`, les CLI et le support de test, pour un seul câblage.
 */
import { randomUUID } from 'node:crypto'

import { toContextId, type ContextId } from '@context-hub/domain/context/types.ts'

import { AuthService } from './application/auth/AuthService.ts'
import { ContextService } from './application/contexts/ContextService.ts'
import type { MaintenanceTask } from './application/maintenance.ts'
import { ContextCatalog } from './application/mcp/ContextCatalog.ts'
import type { Clock } from './application/ports/Clock.ts'
import type { Logger } from './application/ports/Logger.ts'
import { TaxonomyService } from './application/taxonomy/TaxonomyService.ts'
import { MissionService } from './application/missions/MissionService.ts'
import { WorkspaceService } from './application/workspaces/WorkspaceService.ts'
import { OverviewService } from './application/overview/OverviewService.ts'
import type { AppDatabase } from './infrastructure/db/connection.ts'
import { Fts5SearchIndex } from './infrastructure/db/search/Fts5SearchIndex.ts'
import { DrizzleContextStore } from './infrastructure/db/stores/DrizzleContextStore.ts'
import { DrizzleMissionStore } from './infrastructure/db/stores/DrizzleMissionStore.ts'
import { DrizzleMcpReadLog } from './infrastructure/db/stores/DrizzleMcpReadLog.ts'
import { DrizzleTaxonomyStore } from './infrastructure/db/stores/DrizzleTaxonomyStore.ts'
import { DrizzleUserStore } from './infrastructure/db/stores/DrizzleUserStore.ts'
import { DrizzleWorkspaceStore } from './infrastructure/db/stores/DrizzleWorkspaceStore.ts'
import {
  InProcessContextEvents,
  InProcessWorkspaceEvents,
} from './infrastructure/events/InProcessContextEvents.ts'
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
  /** Identifiants des workspaces et claims (tests : prévisibles). */
  readonly newWorkspaceId?: (prefix: 'ws' | 'claim') => string
  /** Identifiants et jetons de réservation des missions (tests : prévisibles). */
  readonly newMissionId?: () => string
  readonly newReservationToken?: () => string
}

/** Origines locales, plus celle du front : les autres sont refusées sur /mcp (403). */
function allowedOrigins(webOrigin: string): string[] {
  return ['localhost', '127.0.0.1', '[::1]', new URL(webOrigin).hostname]
}

const newContextId = (): ContextId => toContextId(`ctx-${randomUUID()}`)
const newWorkspaceId = (prefix: 'ws' | 'claim'): string => `${prefix}-${randomUUID()}`
const newMissionId = (): string => `mission-${randomUUID()}`

export function composeServer(db: AppDatabase, options: CompositionOptions) {
  const searchIndex = new Fts5SearchIndex()
  const contextStore = new DrizzleContextStore(db, searchIndex, options.clock)
  const taxonomyStore = new DrizzleTaxonomyStore(db, searchIndex)
  const onListenerError = (error: unknown) => {
    options.logger.error('events.listener_error', {
      error: error instanceof Error ? error.name : 'unknown',
    })
  }
  const events = new InProcessContextEvents(onListenerError)
  const workspaceEvents = new InProcessWorkspaceEvents(onListenerError)
  const auth = new AuthService(new DrizzleUserStore(db), options.clock)
  const contexts = new ContextService({
    store: contextStore,
    clock: options.clock,
    newId: options.newContextId ?? newContextId,
    events,
  })
  const workspaces = new WorkspaceService({
    store: new DrizzleWorkspaceStore(db),
    contextStore,
    contexts,
    clock: options.clock,
    newId: options.newWorkspaceId ?? newWorkspaceId,
    events: workspaceEvents,
  })
  const missionStore = new DrizzleMissionStore(db)
  const missions = new MissionService({
    store: missionStore,
    contextStore,
    clock: options.clock,
    newId: options.newMissionId ?? newMissionId,
    ...(options.newReservationToken ? { newToken: options.newReservationToken } : {}),
  })
  const app = createHttpApp({
    auth,
    contexts,
    taxonomy: new TaxonomyService(taxonomyStore, options.clock),
    overview: new OverviewService(
      contextStore,
      taxonomyStore,
      options.workspaceName,
      workspaces,
      missions,
    ),
    workspaces,
    missions,
    logger: options.logger,
    webOrigin: options.webOrigin,
  })
  const mcp = mountMcp(app, {
    auth,
    catalog: new ContextCatalog(contextStore, new DrizzleMcpReadLog(db), options.clock),
    events,
    workspaces,
    missions,
    workspaceEvents,
    logger: options.logger,
    allowedHosts: options.allowedHosts,
    allowedOrigins: allowedOrigins(options.webOrigin),
  })
  const maintenance: readonly MaintenanceTask[] = [
    { name: 'workspaces', run: () => workspaces.closeIdleWorkspaces() },
    {
      name: 'missions',
      // Copie littérale : une interface n'est pas assignable à `LogFields` (signature d'index).
      run: async () => ({ ...(await missionStore.expireDue(options.clock.now())) }),
    },
  ]
  return { app, mcp, workspaces, missions, maintenance }
}
