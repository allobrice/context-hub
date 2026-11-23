import { createRoute, type OpenAPIHono, type z } from '@hono/zod-openapi'

import {
  CollectionInputSchema,
  CollectionListSchema,
  CollectionSchema,
  MergeImpactSchema,
  TagListSchema,
  TagMergeSchema,
} from '@context-hub/domain/schemas/taxonomy.ts'

import type { TaxonomyService } from '../../../application/taxonomy/TaxonomyService.ts'
import type { AppEnv } from '../env.ts'
import {
  CollectionParamsSchema,
  DeleteCollectionQuerySchema,
  ERROR_RESPONSES,
  json,
  RenameTagBodySchema,
  TagParamsSchema,
} from '../schemas.ts'

const TAGS = 'Tags'
const COLLECTIONS = 'Collections'
const { 400: invalid, 401: unauthorized, 422: rejected } = ERROR_RESPONSES
const done = { description: 'Fait' }
const jsonBody = <T extends z.ZodType>(schema: T) => ({
  content: { 'application/json': { schema } },
  required: true,
})

const listTagsRoute = createRoute({
  method: 'get',
  path: '/api/tags',
  tags: [TAGS],
  summary: 'Registre des tags, avec compteurs (contextes visibles) et dernier usage',
  responses: { 200: json(TagListSchema, 'Tous les tags'), 401: unauthorized },
})

const renameTagRoute = createRoute({
  method: 'patch',
  path: '/api/tags/{name}',
  tags: [TAGS],
  summary: 'Renomme un tag ; vers un nom existant, c’est une fusion',
  request: { params: TagParamsSchema, body: jsonBody(RenameTagBodySchema) },
  responses: { 204: done, 400: invalid, 401: unauthorized, 422: rejected },
})

const mergeTagsRoute = createRoute({
  method: 'post',
  path: '/api/tags/merge',
  tags: [TAGS],
  summary: 'Fusionne des tags dans une cible (créée au besoin), sans doublon',
  request: { body: jsonBody(TagMergeSchema) },
  responses: { 204: done, 400: invalid, 401: unauthorized, 422: rejected },
})

const previewMergeRoute = createRoute({
  method: 'post',
  path: '/api/tags/merge/preview',
  tags: [TAGS],
  summary: 'Impact chiffré d’une fusion (dialog de fusion)',
  request: { body: jsonBody(TagMergeSchema) },
  responses: { 200: json(MergeImpactSchema, 'Impact'), 400: invalid, 401: unauthorized },
})

const deleteTagRoute = createRoute({
  method: 'delete',
  path: '/api/tags/{name}',
  tags: [TAGS],
  summary: 'Retire le tag de tous les contextes et du registre',
  request: { params: TagParamsSchema },
  responses: { 204: done, 401: unauthorized, 422: rejected },
})

const listCollectionsRoute = createRoute({
  method: 'get',
  path: '/api/collections',
  tags: [COLLECTIONS],
  summary: 'Collections, « Sans collection » (système) en dernier',
  responses: { 200: json(CollectionListSchema, 'Toutes les collections'), 401: unauthorized },
})

const createCollectionRoute = createRoute({
  method: 'post',
  path: '/api/collections',
  tags: [COLLECTIONS],
  summary: 'Crée une collection',
  request: { body: jsonBody(CollectionInputSchema) },
  responses: { 201: json(CollectionSchema, 'Collection créée'), 400: invalid, 401: unauthorized },
})

const updateCollectionRoute = createRoute({
  method: 'patch',
  path: '/api/collections/{id}',
  tags: [COLLECTIONS],
  summary: 'Renomme une collection (« Sans collection » est protégée)',
  request: { params: CollectionParamsSchema, body: jsonBody(CollectionInputSchema) },
  responses: {
    200: json(CollectionSchema, 'Collection mise à jour'),
    400: invalid,
    401: unauthorized,
    422: rejected,
  },
})

const deleteCollectionRoute = createRoute({
  method: 'delete',
  path: '/api/collections/{id}',
  tags: [COLLECTIONS],
  summary: 'Supprime une collection : ses contextes vont vers `targetCollectionId` (obligatoire)',
  request: { params: CollectionParamsSchema, query: DeleteCollectionQuerySchema },
  responses: { 204: done, 400: invalid, 401: unauthorized, 422: rejected },
})

export function registerTaxonomyRoutes(app: OpenAPIHono<AppEnv>, taxonomy: TaxonomyService): void {
  app.openapi(listTagsRoute, async (c) => c.json(await taxonomy.listTags(c.var.viewer), 200))

  app.openapi(renameTagRoute, async (c) => {
    await taxonomy.renameTag(c.var.viewer, c.req.valid('param').name, c.req.valid('json').name)
    return c.body(null, 204)
  })

  app.openapi(mergeTagsRoute, async (c) => {
    const { sources, target } = c.req.valid('json')
    await taxonomy.mergeTags(sources, target)
    return c.body(null, 204)
  })

  app.openapi(previewMergeRoute, async (c) => {
    const { sources, target } = c.req.valid('json')
    return c.json(await taxonomy.previewTagMerge(sources, target), 200)
  })

  app.openapi(deleteTagRoute, async (c) => {
    await taxonomy.deleteTag(c.req.valid('param').name)
    return c.body(null, 204)
  })

  app.openapi(listCollectionsRoute, async (c) =>
    c.json(await taxonomy.listCollections(c.var.viewer), 200),
  )

  app.openapi(createCollectionRoute, async (c) =>
    c.json(await taxonomy.createCollection(c.req.valid('json')), 201),
  )

  app.openapi(updateCollectionRoute, async (c) => {
    const { id } = c.req.valid('param')
    return c.json(await taxonomy.updateCollection(c.var.viewer, id, c.req.valid('json')), 200)
  })

  app.openapi(deleteCollectionRoute, async (c) => {
    const { targetCollectionId, addFormerNameAsTag } = c.req.valid('query')
    await taxonomy.deleteCollection(c.var.viewer, {
      deletedId: c.req.valid('param').id,
      targetId: targetCollectionId,
      addFormerNameAsTag,
    })
    return c.body(null, 204)
  })
}
