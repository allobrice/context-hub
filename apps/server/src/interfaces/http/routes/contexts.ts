import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'

import type { LibraryCriteria } from '@context-hub/domain/library/criteria.ts'
import {
  ContextDetailSchema,
  ContextDraftInputSchema,
} from '@context-hub/domain/schemas/context.ts'
import { LibrarySearchResultSchema } from '@context-hub/domain/schemas/library.ts'

import type { ContextService } from '../../../application/contexts/ContextService.ts'
import type { AppEnv } from '../env.ts'
import {
  ContextParamsSchema,
  ERROR_RESPONSES,
  json,
  LibraryQuerySchema,
  PublishBodySchema,
  SaveDraftBodySchema,
  VersionParamsSchema,
} from '../schemas.ts'

const TAG = 'Contextes'
const {
  400: invalid,
  401: unauthorized,
  404: notFound,
  409: conflict,
  422: rejected,
} = ERROR_RESPONSES
const detail = json(ContextDetailSchema, 'Le contexte, son historique et sa collection')

const searchRoute = createRoute({
  method: 'get',
  path: '/api/contexts',
  tags: [TAG],
  summary: 'Bibliothèque : recherche plein texte, filtres, tri et page (25 par page)',
  request: { query: LibraryQuerySchema },
  responses: {
    500: ERROR_RESPONSES[500],
    200: json(LibrarySearchResultSchema, 'Une page et les compteurs de toute la bibliothèque'),
    400: invalid,
    401: unauthorized,
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/api/contexts/{id}',
  tags: [TAG],
  summary: 'Un contexte, par identifiant ou slug encodé',
  request: { params: ContextParamsSchema },
  responses: { 500: ERROR_RESPONSES[500], 200: detail, 401: unauthorized, 404: notFound },
})

const createContextRoute = createRoute({
  method: 'post',
  path: '/api/contexts',
  tags: [TAG],
  summary: 'Crée un contexte en brouillon (v1)',
  request: {
    body: { content: { 'application/json': { schema: ContextDraftInputSchema } }, required: true },
  },
  responses: {
    500: ERROR_RESPONSES[500],
    201: detail,
    400: invalid,
    401: unauthorized,
    422: rejected,
  },
})

const saveDraftRoute = createRoute({
  method: 'put',
  path: '/api/contexts/{id}/draft',
  tags: [TAG],
  summary:
    'Enregistre le brouillon au-dessus de `baseVersion` (409 si une version a été publiée entre-temps)',
  request: {
    params: ContextParamsSchema,
    body: { content: { 'application/json': { schema: SaveDraftBodySchema } }, required: true },
  },
  responses: {
    500: ERROR_RESPONSES[500],
    200: detail,
    400: invalid,
    401: unauthorized,
    404: notFound,
    409: conflict,
    422: rejected,
  },
})

const publishRoute = createRoute({
  method: 'post',
  path: '/api/contexts/{id}/publish',
  tags: [TAG],
  summary:
    'Publie le brouillon : le serveur rescanne le contenu (422 avec les findings si un secret reste)',
  request: {
    params: ContextParamsSchema,
    body: { content: { 'application/json': { schema: PublishBodySchema } }, required: true },
  },
  responses: {
    500: ERROR_RESPONSES[500],
    200: detail,
    400: invalid,
    401: unauthorized,
    404: notFound,
    409: conflict,
    422: rejected,
  },
})

const archiveRoute = createRoute({
  method: 'post',
  path: '/api/contexts/{id}/archive',
  tags: [TAG],
  summary: 'Archive : les sessions MCP ne lisent plus le contexte',
  request: { params: ContextParamsSchema },
  responses: { 500: ERROR_RESPONSES[500], 200: detail, 401: unauthorized, 404: notFound },
})

const unarchiveRoute = createRoute({
  method: 'post',
  path: '/api/contexts/{id}/unarchive',
  tags: [TAG],
  summary: 'Désarchive : publié s’il a une version publiée, sinon brouillon',
  request: { params: ContextParamsSchema },
  responses: { 500: ERROR_RESPONSES[500], 200: detail, 401: unauthorized, 404: notFound },
})

const restoreRoute = createRoute({
  method: 'post',
  path: '/api/contexts/{id}/versions/{n}/restore',
  tags: [TAG],
  summary: 'Copie la version n dans le brouillon, sans publier',
  request: { params: VersionParamsSchema },
  responses: {
    500: ERROR_RESPONSES[500],
    200: detail,
    400: invalid,
    401: unauthorized,
    404: notFound,
  },
})

export function registerContextRoutes(app: OpenAPIHono<AppEnv>, contexts: ContextService): void {
  app.openapi(searchRoute, async (c) => {
    const query = c.req.valid('query')
    const criteria: LibraryCriteria = {
      query: query.query,
      tags: query.tags,
      collectionId: query.collection ?? null,
      scope: query.scope ?? null,
      status: query.status ?? null,
      sort: query.sort,
      page: query.page,
    }
    return c.json(await contexts.search(c.var.viewer, criteria), 200)
  })

  app.openapi(getRoute, async (c) =>
    c.json(await contexts.get(c.var.viewer, c.req.valid('param').id), 200),
  )

  app.openapi(createContextRoute, async (c) =>
    c.json(await contexts.create(c.var.viewer, c.req.valid('json')), 201),
  )

  app.openapi(saveDraftRoute, async (c) =>
    c.json(
      await contexts.saveDraft(c.var.viewer, c.req.valid('param').id, c.req.valid('json')),
      200,
    ),
  )

  app.openapi(publishRoute, async (c) =>
    c.json(await contexts.publish(c.var.viewer, c.req.valid('param').id, c.req.valid('json')), 200),
  )

  app.openapi(archiveRoute, async (c) =>
    c.json(await contexts.archive(c.var.viewer, c.req.valid('param').id), 200),
  )

  app.openapi(unarchiveRoute, async (c) =>
    c.json(await contexts.unarchive(c.var.viewer, c.req.valid('param').id), 200),
  )

  app.openapi(restoreRoute, async (c) => {
    const { id, n } = c.req.valid('param')
    return c.json(await contexts.restoreVersion(c.var.viewer, id, n), 200)
  })
}
