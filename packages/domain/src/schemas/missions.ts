/**
 * Schémas Zod des Missions (SPEC §8.1), partagés par la validation REST et MCP et l'OpenAPI. Alignés
 * sur les types du domaine par `missions.test.ts`. Les schémas d'entrée (création, résultat…) sont
 * ajoutés avec l'API (étape 10.2).
 */
import { z } from 'zod'

import {
  DELIVERABLE_KINDS,
  MISSION_EVENT_TYPES,
  MISSION_STATUSES,
  PRIORITIES,
} from '../missions/types.ts'
import { ScopeSchema } from './context.ts'
import { SessionRefSchema } from './sessions.ts'

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
  .object({ kind: z.enum(DELIVERABLE_KINDS), ref: z.string() })
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
