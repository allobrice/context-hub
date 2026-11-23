import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import { WorkspaceOverviewSchema } from '@context-hub/domain/schemas/workspace.ts'

import type { WorkspaceService } from '../../../application/workspace/WorkspaceService.ts'
import type { AppEnv } from '../env.ts'
import { ERROR_RESPONSES, HealthSchema, json } from '../schemas.ts'

const workspaceRoute = createRoute({
  method: 'get',
  path: '/api/workspace',
  tags: ['Espace'],
  summary: 'Navigation (sidebar) : utilisateur, compteurs, collections, portées, tags',
  responses: {
    500: ERROR_RESPONSES[500],
    200: json(WorkspaceOverviewSchema, 'Vue d’ensemble'),
    401: ERROR_RESPONSES[401],
  },
})

export const HEALTH_PATH = '/api/health'

const healthRoute = createRoute({
  method: 'get',
  path: HEALTH_PATH,
  tags: ['Espace'],
  summary: 'Santé du serveur (seule route sans authentification)',
  security: [],
  responses: { 200: json(HealthSchema, 'Le serveur répond') },
})

export function registerWorkspaceRoutes(
  app: OpenAPIHono<AppEnv>,
  workspace: WorkspaceService,
): void {
  app.openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200))
  app.openapi(workspaceRoute, async (c) => c.json(await workspace.overview(c.var.user), 200))
}
