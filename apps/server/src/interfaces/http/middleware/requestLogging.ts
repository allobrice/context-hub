import type { Context, MiddlewareHandler } from 'hono'
import { routePath } from 'hono/route'

import type { Logger } from '../../../application/ports/Logger.ts'
import type { User } from '../../../application/viewer.ts'
import type { AppEnv } from '../env.ts'

/** Absent sur /api/health et sur un 401 : le type de `c.var` ne le dit pas. */
function authenticatedUser(c: Context<AppEnv>): User | undefined {
  return c.get('user')
}

/**
 * Une ligne par requête : méthode, route (motif, pas l'URL), statut, durée, utilisateur.
 * Jamais de corps de requête ou de réponse, de query ni d'en-tête : aucun contenu ni jeton.
 */
export function requestLogging(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const started = performance.now()
    await next()
    const user = authenticatedUser(c)
    logger.info('http.request', {
      requestId: c.get('requestId'),
      method: c.req.method,
      route: routePath(c, -1),
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
      user: user?.id ?? null,
    })
  }
}
