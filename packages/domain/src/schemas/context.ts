/**
 * Schémas Zod du contrat d'API pour les contextes, définis une seule fois (serveur : validation et
 * OpenAPI ; front : types générés depuis l'OpenAPI). Alignés sur les types du domaine par
 * `schemas.test.ts`. `.meta({ id })` nomme le schéma dans `components.schemas` de l'OpenAPI.
 */
import { z } from 'zod'

import { isValidFalsePositiveReason } from '../context/editing.ts'
import { CONTEXT_STATUSES, DESCRIPTION_MAX_LENGTH, SCOPE_KINDS } from '../context/types.ts'

/**
 * `schéma | null` pour un schéma nommé (`.meta({ id })`). `.nullable()` hériterait de l'id : le
 * composant OpenAPI deviendrait lui-même nullable, et toute liste de ce composant aussi.
 */
export function orNull<T extends z.ZodType>(schema: T) {
  return z.union([schema, z.null()])
}

export const ScopeKindSchema = z.enum(SCOPE_KINDS).meta({ id: 'ScopeKind' })
export const ContextStatusSchema = z.enum(CONTEXT_STATUSES).meta({ id: 'ContextStatus' })

export const ScopeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('personal'), owner: z.string() }),
    z.object({ kind: z.literal('project'), repo: z.string() }),
    z.object({ kind: z.literal('team'), team: z.string() }),
  ])
  .meta({ id: 'Scope' })

/** Horodatage ISO 8601 (UTC côté serveur). */
const Timestamp = z.string().meta({ format: 'date-time' })

export const ContextVersionSchema = z
  .object({
    number: z.number().int().positive(),
    content: z.string(),
    note: z.string(),
    author: z.string(),
    createdAt: Timestamp,
    tokenEstimate: z.number().int().nonnegative(),
  })
  .meta({ id: 'ContextVersion', description: 'Version immuable (ou brouillon en cours).' })

export const ContextSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    description: z.string(),
    collectionId: z.string().nullable(),
    tags: z.array(z.string()).readonly(),
    scope: ScopeSchema,
    status: ContextStatusSchema,
    publishedVersion: orNull(ContextVersionSchema),
    draft: orNull(ContextVersionSchema),
    createdAt: Timestamp,
    updatedAt: Timestamp,
    author: z.string(),
    mcpReads7d: z.number().int().nonnegative(),
  })
  .meta({ id: 'Context' })

export const ContextDetailSchema = z
  .object({
    context: ContextSchema,
    history: z.array(ContextVersionSchema).readonly(),
    collectionName: z.string().nullable(),
  })
  .meta({ id: 'ContextDetail' })

export const ScanFindingSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('secret'),
      line: z.number().int().positive(),
      pattern: z.string(),
      label: z.string(),
    }),
    z.object({
      kind: z.literal('suspicious-instruction'),
      line: z.number().int().positive(),
      excerpt: z.string(),
    }),
  ])
  .meta({ id: 'ScanFinding' })

export const FalsePositiveSchema = z
  .object({
    findingKey: z.string().min(1),
    reason: z.string().refine(isValidFalsePositiveReason, 'Motif obligatoire (3 caractères min.)'),
  })
  .meta({ id: 'FalsePositive', description: 'Finding écarté par l’auteur, avec sa justification.' })

/** Ce que l'auteur saisit dans l'éditeur. Les règles métier (slug, repo…) sont revérifiées après. */
export const ContextDraftInputSchema = z
  .object({
    title: z.string(),
    slug: z.string(),
    description: z.string().max(DESCRIPTION_MAX_LENGTH * 4),
    collectionId: z.string().nullable(),
    tags: z.array(z.string()).max(50).readonly(),
    scope: ScopeSchema,
    content: z.string().max(500_000),
    versionNote: z.string(),
  })
  .meta({ id: 'ContextDraftInput' })
