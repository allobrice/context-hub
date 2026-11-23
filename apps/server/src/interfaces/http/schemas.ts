/**
 * Schémas propres au transport HTTP (query, paramètres, corps), composés à partir des schémas du
 * domaine : aucune règle métier n'est redéfinie ici.
 */
import { z } from 'zod'

import {
  ContextDraftInputSchema,
  ContextStatusSchema,
  FalsePositiveSchema,
  ScopeKindSchema,
} from '@context-hub/domain/schemas/context.ts'
import {
  DraftRejectedErrorSchema,
  NoDraftErrorSchema,
  NotFoundErrorSchema,
  TaxonomyRuleErrorSchema,
  UnauthorizedErrorSchema,
  ValidationErrorSchema,
  VersionConflictErrorSchema,
} from '@context-hub/domain/schemas/errors.ts'
import { LIBRARY_SORTS } from '@context-hub/domain/library/criteria.ts'

/** Un paramètre de query répété (`tags=a&tags=b`) arrive en tableau, un seul en chaîne. */
const repeated = z.preprocess(
  (value: unknown): unknown =>
    value === undefined || Array.isArray(value) ? (value ?? []) : [value],
  z.array(z.string().min(1)).max(20),
)

export const LibraryQuerySchema = z.object({
  query: z.string().max(200).default(''),
  tags: repeated.meta({ description: 'Tous requis (ET). Répéter le paramètre : tags=a&tags=b.' }),
  collection: z
    .string()
    .optional()
    .meta({ description: 'Identifiant de collection ; « none » = Sans collection.' }),
  scope: ScopeKindSchema.optional(),
  status: ContextStatusSchema.optional(),
  sort: z.enum(LIBRARY_SORTS).default('updated-desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
})

export const ContextParamsSchema = z.object({
  id: z
    .string()
    .min(1)
    .meta({ description: 'Identifiant ou slug encodé (nuxt%2Fconventions-nuxt-4).' }),
})

export const VersionParamsSchema = ContextParamsSchema.extend({
  n: z.coerce.number().int().positive(),
})

export const TagParamsSchema = z.object({ name: z.string().min(1) })
export const CollectionParamsSchema = z.object({ id: z.string().min(1) })

export const SaveDraftBodySchema = z
  .object({
    /** Version publiée au début de l'édition (null si jamais publié) : sinon 409. */
    baseVersion: z.number().int().positive().nullable(),
    draft: ContextDraftInputSchema,
  })
  .meta({ id: 'SaveDraftBody' })

export const PublishBodySchema = z
  .object({
    baseVersion: z.number().int().positive().nullable(),
    note: z.string().max(500),
    falsePositives: z.array(FalsePositiveSchema).max(100).default([]),
  })
  .meta({ id: 'PublishBody' })

export const RenameTagBodySchema = z
  .object({ name: z.string().min(1).max(60) })
  .meta({ id: 'RenameTag' })

export const DeleteCollectionQuerySchema = z.object({
  targetCollectionId: z
    .string()
    .min(1)
    .meta({ description: 'Obligatoire ; « none » = Sans collection.' }),
  addFormerNameAsTag: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export const HealthSchema = z.object({ status: z.literal('ok') }).meta({ id: 'Health' })

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  description,
  content: { 'application/json': { schema } },
})

/** Réponses d'erreur documentées dans l'OpenAPI, au format unique `{ code, message, details? }`. */
export const ERROR_RESPONSES = {
  400: json(ValidationErrorSchema, 'Requête invalide'),
  401: json(UnauthorizedErrorSchema, 'Jeton absent ou invalide'),
  404: json(NotFoundErrorSchema, 'Introuvable ou hors de portée'),
  409: json(
    z.union([VersionConflictErrorSchema, NoDraftErrorSchema]),
    'Conflit : version publiée entre-temps, ou rien à publier',
  ),
  422: json(
    z.union([DraftRejectedErrorSchema, TaxonomyRuleErrorSchema]),
    'Règle métier refusée (scan, slug, taxonomie…)',
  ),
} as const
