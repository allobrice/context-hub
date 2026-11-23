import type { MiddlewareHandler } from 'hono'

import type { AuthService } from '../../../application/auth/AuthService.ts'
import type { AppEnv } from '../env.ts'
import { UNAUTHORIZED } from '../errors.ts'

const BEARER = /^Bearer\s+(\S+)$/i

/** Extrait le jeton d'un en-tête `Authorization: Bearer <jeton>`, ou null. */
export function bearerToken(header: string | undefined): string | null {
  return BEARER.exec(header ?? '')?.[1] ?? null
}

/**
 * Exige `Authorization: Bearer <jeton>` ; le jeton est comparé à son hash en base. Pose `user` et
 * `viewer` (portées appliquées par les cas d'usage). Les chemins de `publicPaths` sont exemptés.
 */
export function authenticate(
  auth: AuthService,
  publicPaths: ReadonlySet<string> = new Set(),
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (publicPaths.has(c.req.path)) return next()
    const token = bearerToken(c.req.header('Authorization'))
    const user = token === null ? null : await auth.authenticate(token)
    if (!user) {
      c.header('WWW-Authenticate', 'Bearer realm="context-hub"')
      return c.json(UNAUTHORIZED.body, UNAUTHORIZED.status)
    }
    c.set('user', user)
    c.set('viewer', { userId: user.id })
    return next()
  }
}
