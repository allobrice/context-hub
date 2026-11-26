/**
 * Schémas Zod des Missions (SPEC §8.1), partagés par la validation REST et MCP et l'OpenAPI. Alignés
 * sur les types du domaine par `missions.test.ts`. Les tailles des textes libres sont bornées
 * largement ici (protection du transport) ; les règles métier (gabarit, scan, limites de la SPEC)
 * sont rejouées par `reviewMission` et donnent un 422 détaillé.
 */
import { z } from 'zod'

import {
  DELIVERABLE_KINDS,
  MISSION_EVENT_TYPES,
  MISSION_MAX_FILES,
  MISSION_MAX_TAGS,
  MISSION_QUEUE_FILTERS,
  MISSION_REASON_MAX_LENGTH,
  MISSION_STATUSES,
  PRIORITIES,
} from '../missions/types.ts'
import { REPO_PATH_MAX_LENGTH } from '../shared/repo.ts'
import { ScopeSchema } from './context.ts'
import { RepoSchema, SessionLabelSchema, SessionRefSchema } from './sessions.ts'

export const MissionStatusSchema = z.enum(MISSION_STATUSES).meta({ id: 'MissionStatus' })
export const PrioritySchema = z.enum(PRIORITIES).meta({ id: 'Priority' })

export const MissionOriginSchema = z
  .object({
    label: z.string(),
    batchId: z.string().nullable(),
    session: SessionRefSchema.nullable(),
    createdBy: z.string(),
  })
  .meta({ id: 'MissionOrigin' })

export const CodeRefSchema = z
  .object({ repo: z.string(), commit: z.string(), files: z.array(z.string()).readonly() })
  .meta({ id: 'CodeRef' })

export const FreshnessSchema = z
  .object({
    checkedAt: z.string(),
    changedFiles: z.array(z.string()).readonly(),
    checkedBy: SessionRefSchema,
  })
  .meta({ id: 'Freshness' })

export const ValidationSchema = z
  .object({ by: z.string(), at: z.string() })
  .meta({ id: 'MissionValidation' })

export const MissionClaimSchema = z
  .object({ session: SessionRefSchema, acquiredAt: z.string(), expiresAt: z.string() })
  .meta({ id: 'MissionClaim' })

export const DeliverableSchema = z
  .object({ kind: z.enum(DELIVERABLE_KINDS), ref: z.string().max(500) })
  .meta({ id: 'Deliverable' })

export const MetricSchema = z
  .object({ name: z.string(), before: z.string(), after: z.string() })
  .meta({ id: 'Metric' })

export const MissionResultSchema = z
  .object({
    summary: z.string(),
    deliverables: z.array(DeliverableSchema).readonly(),
    metrics: z.array(MetricSchema).readonly(),
    acceptanceMet: z.boolean(),
  })
  .meta({ id: 'MissionResult' })

/** Forme plate de la SPEC : les champs propres à un statut sont `null` dans les autres. */
export const MissionSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    prompt: z.string(),
    priority: PrioritySchema,
    tags: z.array(z.string()).readonly(),
    scope: ScopeSchema,
    status: MissionStatusSchema,
    origin: MissionOriginSchema,
    codeRef: CodeRefSchema,
    freshness: FreshnessSchema.nullable(),
    linkedContextIds: z.array(z.string()).readonly(),
    workspaceId: z.string().nullable(),
    suspicious: z.boolean().meta({ description: 'Instruction suspecte conservée (création humaine).' }),
    validation: ValidationSchema.nullable(),
    claim: MissionClaimSchema.nullable(),
    result: MissionResultSchema.nullable(),
    dropReason: z.string().nullable(),
    createdAt: z.string(),
    expiresAt: z.string(),
    closedAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Mission' })

export const MissionEventActorSchema = z
  .union([
    SessionRefSchema,
    z.object({ userId: z.string() }),
    z.object({ system: z.literal('job') }),
  ])
  .meta({ id: 'MissionEventActor' })

export const MissionEventSchema = z
  .object({
    missionId: z.string(),
    missionSlug: z.string(),
    missionTitle: z.string(),
    at: z.string(),
    actor: MissionEventActorSchema,
    type: z.enum(MISSION_EVENT_TYPES),
    detail: z.string().nullable(),
  })
  .meta({ id: 'MissionEvent' })

// ── Vues de l'API ────────────────────────────────────────────────────────────

const statusCounts = z.object(
  Object.fromEntries(MISSION_STATUSES.map((status) => [status, z.number().int()])),
)

export const MissionQueueFilterSchema = z.enum(MISSION_QUEUE_FILTERS).meta({
  id: 'MissionQueueFilter',
  description:
    'todo : à valider, prêtes et en cours ; archived : terminées, abandonnées et expirées.',
})

export const MissionSummarySchema = MissionSchema.omit({ prompt: true }).meta({
  id: 'MissionSummary',
})

export const MissionListSchema = z
  .object({
    items: z.array(MissionSummarySchema).readonly(),
    counts: z.object(
      Object.fromEntries(MISSION_QUEUE_FILTERS.map((filter) => [filter, z.number().int()])),
    ),
  })
  .meta({ id: 'MissionList' })

export const MissionLinkedContextSchema = z
  .object({ id: z.string(), slug: z.string(), title: z.string(), version: z.number().int() })
  .meta({ id: 'MissionLinkedContext' })

export const MissionDetailSchema = z
  .object({
    mission: MissionSchema,
    promptTokens: z.number().int(),
    linkedContexts: z.array(MissionLinkedContextSchema).readonly(),
    events: z.array(MissionEventSchema).readonly(),
  })
  .meta({ id: 'MissionDetail' })

export const MissionBatchSchema = z
  .object({
    batchId: z.string(),
    label: z.string(),
    session: SessionRefSchema.nullable(),
    repo: z.string(),
    commit: z.string(),
    createdAt: z.string(),
    counts: statusCounts,
    total: z.number().int(),
  })
  .meta({ id: 'MissionBatch' })

// ── Entrées ──────────────────────────────────────────────────────────────────

/** Borne de transport d'un texte libre (la règle métier est plus stricte, voir `reviewMission`). */
const text = (max: number) => z.string().max(max)
const PROMPT_TRANSPORT_MAX = 20_000

export const MissionSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .meta({ description: 'Minuscules, chiffres et tirets, ex. « perf-lcp-carrousel ».' })

export const BatchIdSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[\w.-]+$/)
  .meta({ description: 'Lot : les missions d’une même analyse, ex. « audit-perf-home-2026-11-25 ».' })

/** Portée d'une nouvelle mission : `personal` est toujours attribuée à son auteur. */
export const MissionScopeInputSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('personal') }),
    z.object({ kind: z.literal('team'), team: z.string().min(1).max(80) }),
    z.object({ kind: z.literal('project'), repo: RepoSchema }),
  ])
  .meta({ id: 'MissionScopeInput' })

export const CodeRefInputSchema = z
  .object({
    repo: RepoSchema,
    commit: z.string().min(1).max(40),
    files: z.array(text(REPO_PATH_MAX_LENGTH)).max(MISSION_MAX_FILES * 2).default([]),
  })
  .meta({ id: 'CodeRefInput' })

export const CreateMissionInputSchema = z
  .object({
    title: text(500),
    summary: text(1_000),
    prompt: text(PROMPT_TRANSPORT_MAX).meta({
      description: 'Markdown autonome : Objectif, Constat, Fichiers, À faire, Critères d’acceptation.',
    }),
    priority: PrioritySchema.default('P2'),
    tags: z.array(text(60)).max(MISSION_MAX_TAGS * 2).default([]),
    scope: MissionScopeInputSchema,
    origin: z.object({ label: text(200), batchId: BatchIdSchema.nullable().default(null) }),
    codeRef: CodeRefInputSchema,
    linkedContextIds: z.array(z.string().max(100)).max(10).default([]),
  })
  .meta({ id: 'CreateMissionInput' })

export const UpdateMissionInputSchema = z
  .object({
    title: text(500).optional(),
    summary: text(1_000).optional(),
    prompt: text(PROMPT_TRANSPORT_MAX).optional(),
    priority: PrioritySchema.optional(),
    tags: z.array(text(60)).max(MISSION_MAX_TAGS * 2).optional(),
    expectedUpdatedAt: z.string().meta({
      description: '`updatedAt` lu : 409 MISSION_CONFLICT si la mission a changé depuis.',
    }),
  })
  .meta({ id: 'UpdateMissionInput' })

export const RejectMissionInputSchema = z
  .object({ reason: text(MISSION_REASON_MAX_LENGTH).nullable().default(null) })
  .meta({ id: 'RejectMissionInput' })

export const DropMissionInputSchema = z
  .object({ reason: z.string().min(1).max(MISSION_REASON_MAX_LENGTH) })
  .meta({ id: 'DropMissionInput' })

/** Session qui agit sur une mission qu'elle tient : label, repo et jeton remis par `take`. */
export const MissionSessionInputSchema = z
  .object({
    session: SessionLabelSchema,
    repo: RepoSchema.nullable().default(null),
    token: z.string().min(1).max(200).meta({ description: 'Jeton de réservation remis par take.' }),
  })
  .meta({ id: 'MissionSessionInput' })

export const MissionResultInputSchema = z
  .object({
    summary: z.string().min(1).max(4_000),
    deliverables: z.array(DeliverableSchema).max(20).default([]),
    metrics: z
      .array(
        z.object({
          name: z.string().min(1).max(100),
          before: z.string().max(100),
          after: z.string().max(100),
        }),
      )
      .max(20)
      .default([]),
    acceptanceMet: z.boolean(),
  })
  .meta({ id: 'MissionResultInput' })
