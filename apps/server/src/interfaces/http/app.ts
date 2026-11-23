import { OpenAPIHono } from '@hono/zod-openapi'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'

import type { AuthService } from '../../application/auth/AuthService.ts'
import type { ContextService } from '../../application/contexts/ContextService.ts'
import type { Logger } from '../../application/ports/Logger.ts'
import type { TaxonomyService } from '../../application/taxonomy/TaxonomyService.ts'
import type { WorkspaceService } from '../../application/workspace/WorkspaceService.ts'
import type { AppEnv } from './env.ts'
import { handleError, notFound, validationHook } from './errors.ts'
import { authenticate } from './middleware/authenticate.ts'
import { requestLogging } from './middleware/requestLogging.ts'
import { registerContextRoutes } from './routes/contexts.ts'
import { registerTaxonomyRoutes } from './routes/taxonomy.ts'
import { HEALTH_PATH, registerWorkspaceRoutes } from './routes/workspace.ts'

export const OPENAPI_PATH = '/api/openapi.json'

/** Corps de requête maximal : un contexte fait au plus 500 000 caractères (schéma du brouillon). */
const MAX_BODY_BYTES = 2 * 1024 * 1024

export interface HttpAppDependencies {
  readonly auth: AuthService
  readonly contexts: ContextService
  readonly taxonomy: TaxonomyService
  readonly workspace: WorkspaceService
  readonly logger: Logger
  /** Seule origine autorisée par CORS (le front). */
  readonly webOrigin: string
}

export const OPENAPI_DOCUMENT = {
  openapi: '3.1.0',
  info: {
    title: 'Context Hub API',
    version: '1.0.0',
    description:
      'API REST de l’UI Context Hub. Toutes les routes exigent `Authorization: Bearer <jeton>`, sauf /api/health. Erreurs : `{ code, message, details? }`.',
  },
  security: [{ bearerAuth: [] }],
}

/** Application Hono : `/api/*` (REST + contrat OpenAPI). Le serveur MCP s'y montera sur `/mcp`. */
export function createHttpApp(deps: HttpAppDependencies): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

  app.use('*', requestId())
  app.use('*', requestLogging(deps.logger))
  app.use(
    '/api/*',
    cors({
      origin: deps.webOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: ['Authorization', 'Content-Type'],
      maxAge: 600,
    }),
  )
  app.use('/api/*', bodyLimit({ maxSize: MAX_BODY_BYTES }))
  app.use('/api/*', authenticate(deps.auth, new Set([HEALTH_PATH])))

  registerWorkspaceRoutes(app, deps.workspace)
  registerContextRoutes(app, deps.contexts)
  registerTaxonomyRoutes(app, deps.taxonomy)

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description: 'Jeton d’API Context Hub (préfixe chub_).',
  })
  app.doc31(OPENAPI_PATH, OPENAPI_DOCUMENT)

  app.notFound(notFound)
  app.onError(handleError(deps.logger))
  return app
}
