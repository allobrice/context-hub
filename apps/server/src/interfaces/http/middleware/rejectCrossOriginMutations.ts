import type { MiddlewareHandler } from 'hono'

import type { ApiError } from '@context-hub/domain/schemas/errors.ts'

import type { AppEnv } from '../env.ts'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Protection CSRF : une mutation portant un en-tête `Origin` autre que celui du front est refusée
 * (403). Sans elle, un site tiers pourrait soumettre un formulaire vers le proxy Vite de dev, qui
 * ajoute le jeton à toute requête `/api`. Les clients sans `Origin` (CLI, tests, MCP) passent : ils
 * n'agissent pas au nom d'un navigateur.
 */
export function rejectCrossOriginMutations(webOrigin: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const origin = c.req.header('Origin')
    if (SAFE_METHODS.has(c.req.method) || origin === undefined || origin === webOrigin)
      return next()
    const body: ApiError = {
      code: 'FORBIDDEN_ORIGIN',
      message: 'Mutation refusée : origine non autorisée.',
    }
    return c.json(body, 403)
  }
}
