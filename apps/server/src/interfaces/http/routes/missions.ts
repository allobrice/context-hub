/**
 * API REST des Missions (SPEC §8) : file, détail, création et actions humaines (UI), et heartbeat
 * du plugin Claude Code. Les sessions prennent et terminent les missions par MCP. Mêmes cas d'usage
 * que le MCP (`MissionService`).
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import {
  ForbiddenOriginErrorSchema,
  MissionConflictErrorSchema,
  MissionReservationErrorSchema,
  MissionRuleErrorSchema,
  MissionTransitionErrorSchema,
} from '@context-hub/domain/schemas/errors.ts'
import {
  BatchIdSchema,
  CreateMissionInputSchema,
  DropMissionInputSchema,
  MissionBatchSchema,
  MissionDetailSchema,
  MissionEventSchema,
  MissionListSchema,
  MissionQueueFilterSchema,
  MissionSessionInputSchema,
  MissionSlugSchema,
  RejectMissionInputSchema,
  UpdateMissionInputSchema,
} from '@context-hub/domain/schemas/missions.ts'
import { RepoSchema } from '@context-hub/domain/schemas/sessions.ts'

import type { MissionService } from '../../../application/missions/MissionService.ts'
import type { AppEnv } from '../env.ts'
import { ERROR_RESPONSES, json } from '../schemas.ts'

const TAG = 'Missions'
const { 400: invalid, 401: unauthorized, 404: notFound } = ERROR_RESPONSES

const forbidden = json(
  z.union([MissionReservationErrorSchema, ForbiddenOriginErrorSchema]),
  'Jeton de réservation invalide, ou mutation depuis une origine étrangère',
)
const conflict = json(
  z.union([MissionTransitionErrorSchema, MissionConflictErrorSchema]),
  'Commande refusée par le cycle de vie, ou mission modifiée entre-temps',
)
const rejected = json(MissionRuleErrorSchema, 'Mission refusée (gabarit, scan, champ)')

const SlugParams = z.object({ slug: MissionSlugSchema })
const BatchParams = z.object({ id: BatchIdSchema })

const ListQuery = z.object({
  filter: MissionQueueFilterSchema.default('todo'),
  tags: z
    .string()
    .max(500)
    .optional()
    .transform((value) =>
      (value ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
    )
    .meta({ description: 'Tags séparés par des virgules : la mission doit les porter tous.' }),
  repo: RepoSchema.optional(),
  batch: BatchIdSchema.optional(),
})

const HeartbeatResultSchema = z
  .object({ expiresAt: z.string() })
  .meta({ id: 'MissionHeartbeatResult' })

const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
})

const readResponses = { 500: ERROR_RESPONSES[500], 400: invalid, 401: unauthorized, 404: notFound }
const actionResponses = { ...readResponses, 403: forbidden, 409: conflict }

const listRoute = createRoute({
  method: 'get',
  path: '/api/missions',
  tags: [TAG],
  summary: 'File des missions : filtre segmenté, tags, repo, lot ; tri priorité puis ancienneté',
  request: { query: ListQuery },
  responses: { ...readResponses, 200: json(MissionListSchema, 'Missions (sans prompt) et compteurs') },
})

const createMissionRoute = createRoute({
  method: 'post',
  path: '/api/missions',
  tags: [TAG],
  summary: 'Crée une mission (humain : prête directement)',
  request: body(CreateMissionInputSchema),
  responses: {
    ...readResponses,
    201: json(MissionDetailSchema, 'Mission créée'),
    403: forbidden,
    422: rejected,
  },
})

const batchRoute = createRoute({
  method: 'get',
  path: '/api/missions/batches/{id}',
  tags: [TAG],
  summary: 'Synthèse d’un lot (bloc « Origine ») : libellé, session, repo@commit, statuts',
  request: { params: BatchParams },
  responses: { ...readResponses, 200: json(MissionBatchSchema, 'Synthèse du lot') },
})

const getRoute = createRoute({
  method: 'get',
  path: '/api/missions/{slug}',
  tags: [TAG],
  summary: 'Détail d’une mission : prompt, contextes liés, historique',
  request: { params: SlugParams },
  responses: { ...readResponses, 200: json(MissionDetailSchema, 'Mission') },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/api/missions/{slug}',
  tags: [TAG],
  summary: 'Modifie une mission à valider ou prête (garde `expectedUpdatedAt`)',
  request: { params: SlugParams, ...body(UpdateMissionInputSchema) },
  responses: {
    ...actionResponses,
    200: json(MissionDetailSchema, 'Mission modifiée'),
    422: rejected,
  },
})

function actionRoute(action: string, summary: string, input?: z.ZodType) {
  return createRoute({
    method: 'post',
    path: `/api/missions/{slug}/${action}`,
    tags: [TAG],
    summary,
    request: { params: SlugParams, ...(input === undefined ? {} : body(input)) },
    responses: { ...actionResponses, 200: json(MissionDetailSchema, 'Mission après l’action') },
  })
}

const validateRoute = actionRoute('validate', 'Valide une mission à valider : elle devient prête')
const releaseRoute = actionRoute('release', 'Libère une mission en cours : elle redevient prête')
const dropRoute = createRoute({
  method: 'post',
  path: '/api/missions/{slug}/drop',
  tags: [TAG],
  summary: 'Abandonne une mission prête ou en cours (raison obligatoire)',
  request: { params: SlugParams, ...body(DropMissionInputSchema) },
  responses: { ...actionResponses, 200: json(MissionDetailSchema, 'Mission abandonnée') },
})
const reopenRoute = actionRoute('reopen', 'Rouvre une mission terminée ou abandonnée')

const rejectRoute = createRoute({
  method: 'post',
  path: '/api/missions/{slug}/reject',
  tags: [TAG],
  summary: 'Rejette une mission à valider : elle est supprimée, l’événement reste',
  request: { params: SlugParams, ...body(RejectMissionInputSchema) },
  responses: { ...actionResponses, 200: json(MissionEventSchema, 'Événement de rejet') },
})

const heartbeatRoute = createRoute({
  method: 'post',
  path: '/api/missions/{slug}/heartbeat',
  tags: [TAG],
  summary: 'Heartbeat du plugin : prolonge la réservation de la session détentrice',
  request: { params: SlugParams, ...body(MissionSessionInputSchema) },
  responses: { ...actionResponses, 200: json(HeartbeatResultSchema, 'Nouvelle échéance') },
})

export function registerMissionRoutes(app: OpenAPIHono<AppEnv>, missions: MissionService): void {
  app.openapi(listRoute, async (c) => {
    const { filter, tags, repo, batch } = c.req.valid('query')
    return c.json(
      await missions.list(c.var.viewer, {
        filter,
        tags,
        repo: repo ?? null,
        batchId: batch ?? null,
      }),
      200,
    )
  })

  app.openapi(createMissionRoute, async (c) =>
    c.json(await missions.createByHuman(c.var.viewer, c.req.valid('json')), 201),
  )

  app.openapi(batchRoute, async (c) =>
    c.json(await missions.batch(c.var.viewer, c.req.valid('param').id), 200),
  )

  app.openapi(getRoute, async (c) =>
    c.json(await missions.get(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(updateRoute, async (c) =>
    c.json(
      await missions.update(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )

  app.openapi(validateRoute, async (c) =>
    c.json(await missions.validate(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(rejectRoute, async (c) =>
    c.json(
      await missions.reject(
        c.var.viewer,
        c.req.valid('param').slug,
        c.req.valid('json').reason,
      ),
      200,
    ),
  )

  app.openapi(releaseRoute, async (c) =>
    c.json(await missions.release(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(dropRoute, async (c) =>
    c.json(
      await missions.drop(c.var.viewer, c.req.valid('param').slug, c.req.valid('json').reason),
      200,
    ),
  )

  app.openapi(reopenRoute, async (c) =>
    c.json(await missions.reopen(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(heartbeatRoute, async (c) =>
    c.json(
      await missions.heartbeat(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )
}
