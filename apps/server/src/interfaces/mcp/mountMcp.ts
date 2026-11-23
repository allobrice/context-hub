/**
 * Monte le serveur MCP sur `/mcp`, dans l'app Hono, derrière :
 * 1. la validation du Host (protection contre le DNS rebinding) et de l'Origin, helpers du SDK ;
 * 2. la limite de taille du corps ;
 * 3. le même middleware d'authentification Bearer que l'API REST.
 *
 * Aiguillage par protocole (pattern documenté par le SDK, `isLegacyRequest`) :
 * - 2025 (`initialize`, `Mcp-Session-Id`) → sessions avec état (`LegacySessions`) ;
 * - 2026-07-28 → `createMcpHandler` strict (`legacy: 'reject'`), notifications via `subscriptions/listen`.
 * Une publication ou un archivage notifie les deux (`notifications/resources/list_changed`).
 */
import type { OpenAPIHono } from '@hono/zod-openapi'
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/hono'
import { createMcpHandler, isLegacyRequest, type AuthInfo } from '@modelcontextprotocol/server'
import { bodyLimit } from 'hono/body-limit'

import type { AuthService } from '../../application/auth/AuthService.ts'
import type { ContextCatalog } from '../../application/mcp/ContextCatalog.ts'
import type { ContextEvents } from '../../application/ports/ContextEvents.ts'
import type { Logger } from '../../application/ports/Logger.ts'
import { toUserId, type Viewer } from '../../application/viewer.ts'
import type { AppEnv } from '../http/env.ts'
import { authenticate, bearerToken } from '../http/middleware/authenticate.ts'
import { createContextHubMcpServer } from './contextHubServer.ts'
import { LegacySessions } from './legacySessions.ts'

export const MCP_PATH = '/mcp'

const MAX_MCP_BODY_BYTES = 1024 * 1024
/** Seule capacité exposée : la lecture des contextes publiés. */
const MCP_SCOPES = ['contexts:read']

export interface McpMountDependencies {
  readonly auth: AuthService
  readonly catalog: ContextCatalog
  readonly events: ContextEvents
  readonly logger: Logger
  /** Noms d'hôte acceptés dans `Host` (sans port). */
  readonly allowedHosts: readonly string[]
  /** Noms d'hôte acceptés dans `Origin` (sans port) ; les clients sans Origin passent. */
  readonly allowedOrigins: readonly string[]
}

export interface McpMount {
  readonly legacySessions: LegacySessions
  close(): Promise<void>
}

/** L'utilisateur authentifié voyage jusqu'aux handlers modernes par `authInfo.clientId`. */
function viewerOf(authInfo: AuthInfo | undefined): Viewer {
  if (!authInfo) throw new Error('Requête MCP sans authentification')
  return { userId: toUserId(authInfo.clientId) }
}

export function mountMcp(app: OpenAPIHono<AppEnv>, deps: McpMountDependencies): McpMount {
  const createServer = (viewer: Viewer) =>
    createContextHubMcpServer({ catalog: deps.catalog, logger: deps.logger }, viewer)
  const legacy = new LegacySessions(createServer, deps.logger)
  const modern = createMcpHandler((ctx) => createServer(viewerOf(ctx.authInfo)), {
    legacy: 'reject',
    maxRequestBodySize: MAX_MCP_BODY_BYTES,
    onerror: (error) => {
      deps.logger.error('mcp.error', { error: error.name })
    },
  })
  const unsubscribe = deps.events.subscribe(() => {
    legacy.notifyResourcesChanged()
    modern.notify.resourcesChanged()
  })

  app.use(MCP_PATH, hostHeaderValidation([...deps.allowedHosts]))
  app.use(MCP_PATH, originValidation([...deps.allowedOrigins]))
  app.use(MCP_PATH, bodyLimit({ maxSize: MAX_MCP_BODY_BYTES }))
  app.use(MCP_PATH, authenticate(deps.auth))
  app.all(MCP_PATH, async (c) => {
    const authInfo: AuthInfo = {
      token: bearerToken(c.req.header('Authorization')) ?? '',
      clientId: c.var.user.id,
      scopes: MCP_SCOPES,
    }
    const request = c.req.raw
    if (await isLegacyRequest(request, undefined, { maxRequestBodySize: MAX_MCP_BODY_BYTES }))
      return legacy.handle(request, c.var.viewer, authInfo)
    return modern.fetch(request, { authInfo })
  })

  return {
    legacySessions: legacy,
    close: async () => {
      unsubscribe()
      await Promise.all([legacy.closeAll(), modern.close()])
    },
  }
}
