/**
 * Traduction unique des erreurs en réponses HTTP `{ code, message, details? }` (ApiError).
 * Les erreurs inattendues donnent un 500 générique : leur détail ne part que dans les logs, sans
 * contenu de contexte.
 */
import type { Context as HonoContext } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { routePath } from 'hono/route'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

import type { ApiError } from '@context-hub/domain/schemas/errors.ts'
import {
  ClaimConflictError,
  ContextNotFoundError,
  DraftRejectedError,
  TaxonomyRuleError,
  VersionConflictError,
  WorkspaceClosedError,
  WorkspaceForbiddenError,
  WorkspaceNotFoundError,
  WorkspaceRuleError,
} from '@context-hub/domain/shared/errors.ts'

import {
  MissionBatchNotFoundError,
  MissionConflictError,
  MissionNotFoundError,
  MissionReservationError,
  MissionRuleError,
  MissionTransitionError,
} from '@context-hub/domain/missions/errors.ts'

import { NoDraftError } from '../../application/errors.ts'
import type { Logger } from '../../application/ports/Logger.ts'
import type { AppEnv } from './env.ts'

export interface ErrorResponse {
  readonly status: ContentfulStatusCode
  readonly body: ApiError
}

export const UNAUTHORIZED: ErrorResponse = {
  status: 401,
  body: { code: 'UNAUTHORIZED', message: 'Jeton d’API absent ou invalide.' },
}

/** Erreurs métier et techniques connues → statut et corps typés ; null pour une erreur inattendue. */
export function knownErrorResponse(error: unknown, requestId: string): ErrorResponse | null {
  if (error instanceof ContextNotFoundError) {
    return {
      status: 404,
      body: {
        code: 'NOT_FOUND',
        message: error.message,
        details: { reference: error.reference, requestId },
      },
    }
  }
  if (error instanceof VersionConflictError) {
    return {
      status: 409,
      body: {
        code: 'VERSION_CONFLICT',
        message: error.message,
        details: {
          baseVersion: error.baseVersion,
          latestVersion: error.latestVersion,
          latest: error.latest
            ? {
                number: error.latest.number,
                author: error.latest.author,
                createdAt: error.latest.createdAt,
                content: error.latest.content,
              }
            : null,
        },
      },
    }
  }
  if (error instanceof NoDraftError) {
    return { status: 409, body: { code: 'NO_DRAFT', message: error.message } }
  }
  if (error instanceof DraftRejectedError) {
    return {
      status: 422,
      body: {
        code: 'DRAFT_REJECTED',
        message: error.message,
        details: { reasons: error.reasons, findings: error.findings },
      },
    }
  }
  if (error instanceof TaxonomyRuleError) {
    return {
      status: 422,
      body: {
        code: 'TAXONOMY_RULE',
        message: error.message,
        details: { violation: error.violation },
      },
    }
  }
  const workspace = workspaceErrorResponse(error, requestId)
  if (workspace) return workspace
  const mission = missionErrorResponse(error, requestId)
  if (mission) return mission
  // JSON malformé, corps trop gros… levés par Hono avant la validation Zod.
  if (error instanceof HTTPException && error.status < 500) {
    return {
      status: error.status,
      body: {
        code: 'VALIDATION_FAILED',
        message: error.message || 'Requête invalide.',
        details: { issues: [] },
      },
    }
  }
  return null
}

/** Erreurs des Workspaces : 404, 403 (non membre), 410 (fermé), 409 (claim), 422 (règle). */
function workspaceErrorResponse(error: unknown, requestId: string): ErrorResponse | null {
  if (error instanceof WorkspaceNotFoundError) {
    return {
      status: 404,
      body: {
        code: 'NOT_FOUND',
        message: error.message,
        details: { reference: error.slug, requestId },
      },
    }
  }
  if (error instanceof WorkspaceForbiddenError) {
    return {
      status: 403,
      body: { code: 'WORKSPACE_FORBIDDEN', message: error.message, details: { slug: error.slug } },
    }
  }
  if (error instanceof WorkspaceClosedError) {
    return {
      status: 410,
      body: { code: 'WORKSPACE_CLOSED', message: error.message, details: { slug: error.slug } },
    }
  }
  if (error instanceof ClaimConflictError) {
    return {
      status: 409,
      body: { code: 'CLAIM_CONFLICT', message: error.message, details: { claim: error.claim } },
    }
  }
  if (error instanceof WorkspaceRuleError) {
    return {
      status: 422,
      body: {
        code: 'WORKSPACE_RULE',
        message: error.message,
        details: { violation: error.violation },
      },
    }
  }
  return null
}

/**
 * Erreurs des Missions : 404, 403 (jeton de réservation), 409 (transition refusée, modification
 * concurrente), 422 (règle : gabarit, scan, champ).
 */
function missionErrorResponse(error: unknown, requestId: string): ErrorResponse | null {
  if (error instanceof MissionNotFoundError) {
    return {
      status: 404,
      body: {
        code: 'NOT_FOUND',
        message: error.message,
        details: { reference: error.reference, requestId },
      },
    }
  }
  if (error instanceof MissionBatchNotFoundError) {
    return {
      status: 404,
      body: {
        code: 'NOT_FOUND',
        message: error.message,
        details: { reference: error.batchId, requestId },
      },
    }
  }
  if (error instanceof MissionReservationError) {
    return {
      status: 403,
      body: { code: 'MISSION_RESERVATION', message: error.message, details: { slug: error.slug } },
    }
  }
  if (error instanceof MissionTransitionError) {
    return {
      status: 409,
      body: { code: 'MISSION_TRANSITION', message: error.message, details: error.refusal },
    }
  }
  if (error instanceof MissionConflictError) {
    return {
      status: 409,
      body: {
        code: 'MISSION_CONFLICT',
        message: error.message,
        details: { updatedAt: error.updatedAt },
      },
    }
  }
  if (error instanceof MissionRuleError) {
    return {
      status: 422,
      body: {
        code: 'MISSION_RULE',
        message: error.message,
        details: { violations: error.violations, missingSections: error.missingSections },
      },
    }
  }
  return null
}

/** `app.onError` : erreur connue → sa réponse ; sinon 500, journalisé sans contenu. */
export function handleError(logger: Logger) {
  return (error: Error, c: HonoContext<AppEnv>): Response => {
    const requestId = c.get('requestId')
    const known = knownErrorResponse(error, requestId)
    if (known) return c.json(known.body, known.status)
    logger.error('http.unexpected_error', {
      requestId,
      method: c.req.method,
      route: routePath(c, -1),
      error: error.name,
    })
    const body: ApiError = {
      code: 'INTERNAL',
      message: 'Erreur interne du serveur.',
      details: { requestId },
    }
    return c.json(body, 500)
  }
}

/** `app.notFound` : route inconnue, au format unique. */
export function notFound(c: HonoContext<AppEnv>): Response {
  const body: ApiError = {
    code: 'NOT_FOUND',
    message: 'Route inconnue.',
    details: { reference: c.req.path, requestId: c.get('requestId') },
  }
  return c.json(body, 404)
}

/** `defaultHook` des routes OpenAPI : un échec de validation Zod donne un 400 détaillé. */
export function validationHook(
  result: { success: true } | { success: false; error: z.ZodError },
  c: HonoContext<AppEnv>,
): Response | undefined {
  if (result.success) return undefined
  const body: ApiError = {
    code: 'VALIDATION_FAILED',
    message: 'Requête invalide.',
    details: {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  }
  return c.json(body, 400)
}
