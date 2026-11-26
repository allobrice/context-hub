/**
 * API REST des Workspaces (SPEC §7) : UI (liste, détail, journal, libération forcée) et hooks du
 * plugin Claude Code (`join`, `heartbeat`, `check-write`). Mêmes cas d'usage que le MCP.
 */
import { createRoute, type OpenAPIHono } from '@hono/zod-openapi'
import { z } from 'zod'

import {
  ClaimConflictErrorSchema,
  ForbiddenOriginErrorSchema,
  WorkspaceClosedErrorSchema,
  WorkspaceForbiddenErrorSchema,
  WorkspaceRuleErrorSchema,
} from '@context-hub/domain/schemas/errors.ts'
import {
  CheckWriteInputSchema,
  CheckWriteResultSchema,
  ClaimInputSchema,
  ClaimSchema,
  CreateWorkspaceInputSchema,
  EntryPageSchema,
  HeartbeatInputSchema,
  HeartbeatResultSchema,
  InviteMemberInputSchema,
  JoinResultSchema,
  PostEntryInputSchema,
  ReleaseInputSchema,
  SyncInputSchema,
  SyncResultSchema,
  WorkspaceDetailSchema,
  WorkspaceEntrySchema,
  WorkspaceListSchema,
  WorkspaceSlugSchema,
} from '@context-hub/domain/schemas/workspaces.ts'
import { SessionInputSchema, SessionLabelSchema } from '@context-hub/domain/schemas/sessions.ts'

import type { WorkspaceService } from '../../../application/workspaces/WorkspaceService.ts'
import type { AppEnv } from '../env.ts'
import { ERROR_RESPONSES, json } from '../schemas.ts'

const TAG = 'Workspaces'
const { 400: invalid, 401: unauthorized, 404: notFound } = ERROR_RESPONSES

const forbidden = json(
  z.union([WorkspaceForbiddenErrorSchema, ForbiddenOriginErrorSchema]),
  'Non membre du workspace, ou mutation depuis une origine étrangère',
)
const gone = json(WorkspaceClosedErrorSchema, 'Workspace fermé : lecture seule')
const conflict = json(ClaimConflictErrorSchema, 'Zone déjà réservée par une autre session')
const rejected = json(WorkspaceRuleErrorSchema, 'Règle métier refusée')

const SlugParams = z.object({ slug: WorkspaceSlugSchema })
const ClaimParams = SlugParams.extend({ id: z.string().min(1).max(100) })

const ListQuery = z.object({
  status: z.enum(['open', 'closed', 'all']).default('open'),
})

const EntriesQuery = z.object({
  since: z.coerce.number().int().positive().optional().meta({
    description:
      'Premier `seq` voulu (inclus) ; défaut 1. Pour le polling : le `nextSeq` précédent.',
  }),
  before: z.coerce.number().int().positive().optional().meta({
    description: 'Entrées plus anciennes que ce `seq` (pagination vers le passé).',
  }),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const ReleaseQuery = z.object({
  force: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true')
    .meta({ description: 'Libération forcée par un humain (UI) : prévient le détenteur.' }),
  session: SessionLabelSchema.optional().meta({
    description: 'Session détentrice (obligatoire sans `force`).',
  }),
})

const ClaimListSchema = z
  .object({ claims: z.array(ClaimSchema).readonly() })
  .meta({ id: 'ClaimList' })

const body = <T extends z.ZodType>(schema: T) => ({
  body: { content: { 'application/json': { schema } }, required: true },
})

const readResponses = {
  500: ERROR_RESPONSES[500],
  400: invalid,
  401: unauthorized,
  403: forbidden,
  404: notFound,
}
const writeResponses = { ...readResponses, 410: gone, 422: rejected }

const listRoute = createRoute({
  method: 'get',
  path: '/api/workspaces',
  tags: [TAG],
  summary: 'Workspaces dont l’utilisateur est membre (filtre : ouverts, fermés, tous)',
  request: { query: ListQuery },
  responses: {
    500: ERROR_RESPONSES[500],
    200: json(WorkspaceListSchema, 'Workspaces et compteurs par statut'),
    400: invalid,
    401: unauthorized,
  },
})

const createWorkspaceRoute = createRoute({
  method: 'post',
  path: '/api/workspaces',
  tags: [TAG],
  summary: 'Crée un workspace (le créateur en est membre)',
  request: body(CreateWorkspaceInputSchema),
  responses: {
    500: ERROR_RESPONSES[500],
    201: json(WorkspaceDetailSchema, 'Workspace créé'),
    400: invalid,
    401: unauthorized,
    403: json(ForbiddenOriginErrorSchema, 'Mutation depuis une origine étrangère (CSRF)'),
    422: rejected,
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/{slug}',
  tags: [TAG],
  summary: 'Détail : membres, participants, claims actifs, contextes liés, compteurs du journal',
  request: { params: SlugParams },
  responses: { ...readResponses, 200: json(WorkspaceDetailSchema, 'Le workspace') },
})

const closeRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/close',
  tags: [TAG],
  summary: 'Ferme le workspace : lecture seule, claims libérés',
  request: { params: SlugParams },
  responses: { ...writeResponses, 200: json(WorkspaceDetailSchema, 'Workspace fermé') },
})

const inviteRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/members',
  tags: [TAG],
  summary: 'Invite un utilisateur (tout membre peut inviter)',
  request: { params: SlugParams, ...body(InviteMemberInputSchema) },
  responses: { ...writeResponses, 200: json(WorkspaceDetailSchema, 'Workspace mis à jour') },
})

const entriesRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/{slug}/entries',
  tags: [TAG],
  summary: 'Journal par curseur (`since`) ou vers le passé (`before`), ordre croissant',
  request: { params: SlugParams, query: EntriesQuery },
  responses: { ...readResponses, 200: json(EntryPageSchema, 'Entrées et curseur suivant') },
})

const postEntryRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/entries',
  tags: [TAG],
  summary: 'Publie une entrée (scannée : secrets masqués). Session par défaut : « ui »',
  request: { params: SlugParams, ...body(PostEntryInputSchema) },
  responses: { ...writeResponses, 201: json(WorkspaceEntrySchema, 'Entrée créée') },
})

const claimsRoute = createRoute({
  method: 'get',
  path: '/api/workspaces/{slug}/claims',
  tags: [TAG],
  summary: 'Claims actifs',
  request: { params: SlugParams },
  responses: { ...readResponses, 200: json(ClaimListSchema, 'Claims non expirés') },
})

const acquireRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/claims',
  tags: [TAG],
  summary:
    'Réserve une zone (409 avec le claim existant si elle chevauche celle d’une autre session)',
  request: { params: SlugParams, ...body(ClaimInputSchema) },
  responses: {
    ...writeResponses,
    201: json(ClaimSchema, 'Claim acquis ou renouvelé'),
    409: conflict,
  },
})

const releaseRoute = createRoute({
  method: 'delete',
  path: '/api/workspaces/{slug}/claims/{id}',
  tags: [TAG],
  summary: 'Libère un claim : par sa session (`session`), ou de force par un humain (`force=true`)',
  request: { params: ClaimParams, query: ReleaseQuery },
  responses: { ...writeResponses, 200: json(ClaimSchema, 'Claim libéré') },
})

const releaseSessionRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/release',
  tags: [TAG],
  summary: 'Libère les zones de la session (par zone, par repo, ou toutes : `/context-hub:leave`)',
  request: { params: SlugParams, ...body(ReleaseInputSchema) },
  responses: { ...writeResponses, 200: json(ClaimListSchema, 'Claims libérés') },
})

const joinRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/join',
  tags: [TAG],
  summary: 'Rejoint (ou rafraîchit) la session et renvoie le résumé plafonné et le curseur',
  request: { params: SlugParams, ...body(SessionInputSchema) },
  responses: { ...writeResponses, 200: json(JoinResultSchema, 'Résumé et curseur') },
})

const heartbeatRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/heartbeat',
  tags: [TAG],
  summary: 'Activité de la session : `lastSeenAt`, curseur, prolongation de ses claims',
  request: { params: SlugParams, ...body(HeartbeatInputSchema) },
  responses: { ...writeResponses, 200: json(HeartbeatResultSchema, 'Activité enregistrée') },
})

const syncRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/sync',
  tags: [TAG],
  summary:
    'Hook UserPromptSubmit : delta plafonné depuis `since` (données attribuées) et heartbeat avec le curseur suivant',
  request: { params: SlugParams, ...body(SyncInputSchema) },
  responses: { ...writeResponses, 200: json(SyncResultSchema, 'Delta et curseur suivant') },
})

const checkWriteRoute = createRoute({
  method: 'post',
  path: '/api/workspaces/{slug}/check-write',
  tags: [TAG],
  summary:
    'Hook PreToolUse : l’écriture de ce fichier est-elle permise ? (bloquée si un claim d’une autre session le couvre)',
  request: { params: SlugParams, ...body(CheckWriteInputSchema) },
  responses: { ...readResponses, 422: rejected, 200: json(CheckWriteResultSchema, 'Verdict') },
})

export function registerWorkspaceRoutes(
  app: OpenAPIHono<AppEnv>,
  workspaces: WorkspaceService,
): void {
  app.openapi(listRoute, async (c) =>
    c.json(await workspaces.list(c.var.viewer, c.req.valid('query').status), 200),
  )

  app.openapi(createWorkspaceRoute, async (c) =>
    c.json(await workspaces.create(c.var.viewer, c.req.valid('json')), 201),
  )

  app.openapi(getRoute, async (c) =>
    c.json(await workspaces.get(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(closeRoute, async (c) =>
    c.json(await workspaces.close(c.var.viewer, c.req.valid('param').slug), 200),
  )

  app.openapi(inviteRoute, async (c) =>
    c.json(
      await workspaces.inviteMember(
        c.var.viewer,
        c.req.valid('param').slug,
        c.req.valid('json').userId,
      ),
      200,
    ),
  )

  app.openapi(entriesRoute, async (c) =>
    c.json(
      await workspaces.readEntries(c.var.viewer, c.req.valid('param').slug, c.req.valid('query')),
      200,
    ),
  )

  app.openapi(postEntryRoute, async (c) =>
    c.json(
      await workspaces.postEntry(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      201,
    ),
  )

  app.openapi(claimsRoute, async (c) =>
    c.json({ claims: await workspaces.claims(c.var.viewer, c.req.valid('param').slug) }, 200),
  )

  app.openapi(acquireRoute, async (c) =>
    c.json(
      await workspaces.acquireClaim(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      201,
    ),
  )

  app.openapi(releaseRoute, async (c) => {
    const { slug, id } = c.req.valid('param')
    const { force, session } = c.req.valid('query')
    if (force) return c.json(await workspaces.forceReleaseClaim(c.var.viewer, slug, id), 200)
    if (session === undefined) {
      return c.json(
        {
          code: 'VALIDATION_FAILED' as const,
          message: 'Requête invalide.',
          details: { issues: [{ path: 'session', message: 'Obligatoire sans force=true.' }] },
        },
        400,
      )
    }
    return c.json(await workspaces.releaseClaim(c.var.viewer, slug, id, session), 200)
  })

  app.openapi(releaseSessionRoute, async (c) =>
    c.json(
      {
        claims: await workspaces.releaseClaims(
          c.var.viewer,
          c.req.valid('param').slug,
          c.req.valid('json'),
        ),
      },
      200,
    ),
  )

  app.openapi(joinRoute, async (c) =>
    c.json(
      await workspaces.join(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )

  app.openapi(heartbeatRoute, async (c) =>
    c.json(
      await workspaces.heartbeat(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )

  app.openapi(syncRoute, async (c) =>
    c.json(
      await workspaces.sync(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )

  app.openapi(checkWriteRoute, async (c) =>
    c.json(
      await workspaces.checkWrite(c.var.viewer, c.req.valid('param').slug, c.req.valid('json')),
      200,
    ),
  )
}
