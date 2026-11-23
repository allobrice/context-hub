/**
 * Format unique des erreurs de l'API : `{ code, message, details? }`. Union discriminée par `code` :
 * le client distingue les erreurs par code, jamais par le texte du message.
 */
import { z } from 'zod'

import { DRAFT_REJECTIONS, TAXONOMY_RULE_VIOLATIONS } from '../shared/errors.ts'
import { orNull, ScanFindingSchema } from './context.ts'

export const API_ERROR_CODES = [
  'UNAUTHORIZED',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'NO_DRAFT',
  'DRAFT_REJECTED',
  'TAXONOMY_RULE',
  'VALIDATION_FAILED',
  'INTERNAL',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

const message = z.string()

export const UnauthorizedErrorSchema = z
  .object({ code: z.literal('UNAUTHORIZED'), message })
  .meta({ id: 'UnauthorizedError' })

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
    NotFoundErrorSchema,
    VersionConflictErrorSchema,
    NoDraftErrorSchema,
    DraftRejectedErrorSchema,
    TaxonomyRuleErrorSchema,
    ValidationErrorSchema,
    InternalErrorSchema,
  ])
  .meta({ id: 'ApiError' })

export type ApiError = z.infer<typeof ApiErrorSchema>
