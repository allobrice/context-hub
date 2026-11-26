/**
 * Format unique des erreurs de l'API : `{ code, message, details? }`. Union discriminée par `code` :
 * le client distingue les erreurs par code, jamais par le texte du message.
 */
import { z } from 'zod'

import {
  DRAFT_REJECTIONS,
  TAXONOMY_RULE_VIOLATIONS,
  WORKSPACE_RULE_VIOLATIONS,
} from '../shared/errors.ts'
import { orNull, ScanFindingSchema } from './context.ts'
import { MISSION_RULE_VIOLATIONS } from '../missions/review.ts'
import { REQUIRED_PROMPT_SECTIONS } from '../missions/template.ts'
import { MISSION_COMMAND_TYPES, TRANSITION_REJECTIONS } from '../missions/lifecycle.ts'
import { MissionStatusSchema } from './missions.ts'
import { ClaimSchema } from './workspaces.ts'

export const API_ERROR_CODES = [
  'UNAUTHORIZED',
  'FORBIDDEN_ORIGIN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'NO_DRAFT',
  'DRAFT_REJECTED',
  'TAXONOMY_RULE',
  'WORKSPACE_FORBIDDEN',
  'WORKSPACE_CLOSED',
  'CLAIM_CONFLICT',
  'WORKSPACE_RULE',
  'MISSION_RULE',
  'MISSION_TRANSITION',
  'MISSION_CONFLICT',
  'MISSION_RESERVATION',
  'VALIDATION_FAILED',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const message = z.string()

export const UnauthorizedErrorSchema = z
  .object({ code: z.literal('UNAUTHORIZED'), message })
  .meta({ id: 'UnauthorizedError' })

export const ForbiddenOriginErrorSchema = z
  .object({ code: z.literal('FORBIDDEN_ORIGIN'), message })
  .meta({
    id: 'ForbiddenOriginError',
    description: 'Mutation envoyée depuis une autre origine que le front (protection CSRF).',
  })

export const NotFoundErrorSchema = z
  .object({
    code: z.literal('NOT_FOUND'),
    message,
    details: z.object({ reference: z.string(), requestId: z.string() }),
  })
  .meta({ id: 'NotFoundError' })

/** Version publiée entre-temps par quelqu'un d'autre (`ConcurrentVersion` du domaine). */
export const ConcurrentVersionSchema = z
  .object({
    number: z.number().int().positive(),
    author: z.string(),
    createdAt: z.string(),
    content: z.string(),
  })
  .meta({ id: 'ConcurrentVersion' })

export const VersionConflictErrorSchema = z
  .object({
    code: z.literal('VERSION_CONFLICT'),
    message,
    details: z.object({
      baseVersion: z.number().int(),
      latestVersion: z.number().int(),
      /** Version publiée entre-temps, pour comparer ou « Repartir de la vN ». */
      latest: orNull(ConcurrentVersionSchema),
    }),
  })
  .meta({ id: 'VersionConflictError' })

export const NoDraftErrorSchema = z
  .object({ code: z.literal('NO_DRAFT'), message })
  .meta({ id: 'NoDraftError', description: 'Publication demandée sans brouillon en cours.' })

export const DraftRejectedErrorSchema = z
  .object({
    code: z.literal('DRAFT_REJECTED'),
    message,
    details: z.object({
      reasons: z.array(z.enum(DRAFT_REJECTIONS)).readonly(),
      /** Findings du scan refait par le serveur, hors faux positifs justifiés. */
      findings: z.array(ScanFindingSchema).readonly(),
    }),
  })
  .meta({ id: 'DraftRejectedError' })

export const TaxonomyRuleErrorSchema = z
  .object({
    code: z.literal('TAXONOMY_RULE'),
    message,
    details: z.object({ violation: z.enum(TAXONOMY_RULE_VIOLATIONS) }),
  })
  .meta({ id: 'TaxonomyRuleError' })

export const WorkspaceForbiddenErrorSchema = z
  .object({
    code: z.literal('WORKSPACE_FORBIDDEN'),
    message,
    details: z.object({ slug: z.string() }),
  })
  .meta({
    id: 'WorkspaceForbiddenError',
    description: 'Seuls les membres d’un workspace (créateur et invités) y accèdent.',
  })

export const WorkspaceClosedErrorSchema = z
  .object({ code: z.literal('WORKSPACE_CLOSED'), message, details: z.object({ slug: z.string() }) })
  .meta({ id: 'WorkspaceClosedError', description: 'Workspace fermé : lecture seule.' })

export const ClaimConflictErrorSchema = z
  .object({ code: z.literal('CLAIM_CONFLICT'), message, details: z.object({ claim: ClaimSchema }) })
  .meta({
    id: 'ClaimConflictError',
    description: 'La zone chevauche un claim actif d’une autre session (renvoyé).',
  })

export const WorkspaceRuleErrorSchema = z
  .object({
    code: z.literal('WORKSPACE_RULE'),
    message,
    details: z.object({ violation: z.enum(WORKSPACE_RULE_VIOLATIONS) }),
  })
  .meta({ id: 'WorkspaceRuleError' })

export const MissionRuleErrorSchema = z
  .object({
    code: z.literal('MISSION_RULE'),
    message,
    details: z.object({
      violations: z.array(z.enum(MISSION_RULE_VIOLATIONS)).readonly(),
      missingSections: z.array(z.enum(REQUIRED_PROMPT_SECTIONS)).readonly(),
    }),
  })
  .meta({
    id: 'MissionRuleError',
    description:
      'Mission refusée : gabarit incomplet, secret, instruction suspecte, champ invalide.',
  })

export const MissionTransitionErrorSchema = z
  .object({
    code: z.literal('MISSION_TRANSITION'),
    message,
    details: z.object({
      rejection: z.enum(TRANSITION_REJECTIONS),
      status: MissionStatusSchema,
      command: z.enum([...MISSION_COMMAND_TYPES, 'renew', 'edit']),
    }),
  })
  .meta({ id: 'MissionTransitionError', description: 'Commande refusée par le cycle de vie.' })

export const MissionConflictErrorSchema = z
  .object({
    code: z.literal('MISSION_CONFLICT'),
    message,
    details: z.object({ slug: z.string(), updatedAt: z.string() }),
  })
  .meta({ id: 'MissionConflictError', description: 'Mission modifiée entre-temps : recharger.' })

export const MissionReservationErrorSchema = z
  .object({
    code: z.literal('MISSION_RESERVATION'),
    message,
    details: z.object({ slug: z.string() }),
  })
  .meta({
    id: 'MissionReservationError',
    description: 'Jeton de réservation absent ou invalide pour la session détentrice.',
  })

export const ValidationErrorSchema = z
  .object({
    code: z.literal('VALIDATION_FAILED'),
    message,
    details: z.object({
      issues: z.array(z.object({ path: z.string(), message: z.string() })).readonly(),
    }),
  })
  .meta({ id: 'ValidationError' })

export const InternalErrorSchema = z
  .object({ code: z.literal('INTERNAL'), message, details: z.object({ requestId: z.string() }) })
  .meta({ id: 'InternalError' })

export const ApiErrorSchema = z
  .discriminatedUnion('code', [
    UnauthorizedErrorSchema,
    ForbiddenOriginErrorSchema,
    NotFoundErrorSchema,
    VersionConflictErrorSchema,
    NoDraftErrorSchema,
    DraftRejectedErrorSchema,
    TaxonomyRuleErrorSchema,
    WorkspaceForbiddenErrorSchema,
    WorkspaceClosedErrorSchema,
    ClaimConflictErrorSchema,
    WorkspaceRuleErrorSchema,
    MissionRuleErrorSchema,
    MissionTransitionErrorSchema,
    MissionConflictErrorSchema,
    MissionReservationErrorSchema,
    ValidationErrorSchema,
    InternalErrorSchema,
  ])
  .meta({ id: 'ApiError' })

export type ApiError = z.infer<typeof ApiErrorSchema>
