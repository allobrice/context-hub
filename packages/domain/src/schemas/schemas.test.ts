/**
 * Alignement des schémas d'API sur les types du domaine : une valeur du domaine doit toujours être
 * acceptée par son schéma (vérifié au typecheck par `expectTypeOf`, et à l'exécution sur les fixtures).
 */
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { z } from 'zod'

import type { ContextDraftInput, FalsePositive } from '../context/editing.ts'
import type { ScanFinding } from '../context/scan.ts'
import type { Context, ContextVersion, Scope } from '../context/types.ts'
import { CONTEXT_FIXTURES } from '../fixtures/contexts.ts'
import type { StatusCounts } from '../library/criteria.ts'
import type { DRAFT_REJECTIONS, TAXONOMY_RULE_VIOLATIONS } from '../shared/errors.ts'
import {
  type ConcurrentVersion,
  type DraftRejection,
  type TaxonomyRuleViolation,
} from '../shared/errors.ts'
import type { MergeImpact } from '../taxonomy/tags.ts'
import type { Collection, Tag } from '../taxonomy/types.ts'
import type {
  ContextDraftInputSchema,
  ContextVersionSchema,
  FalsePositiveSchema,
  ScanFindingSchema,
  ScopeSchema,
} from './context.ts'
import { ContextSchema } from './context.ts'
import type { ConcurrentVersionSchema } from './errors.ts'
import { API_ERROR_CODES, ApiErrorSchema, type ApiError, type ApiErrorCode } from './errors.ts'
import type { StatusCountsSchema } from './library.ts'
import type { CollectionSchema, MergeImpactSchema, TagSchema } from './taxonomy.ts'

describe('schémas d’API', () => {
  it('acceptent les types du domaine (typecheck)', () => {
    expectTypeOf<Scope>().toExtend<z.input<typeof ScopeSchema>>()
    expectTypeOf<ContextVersion>().toExtend<z.input<typeof ContextVersionSchema>>()
    expectTypeOf<Context>().toExtend<z.input<typeof ContextSchema>>()
    expectTypeOf<ScanFinding>().toExtend<z.input<typeof ScanFindingSchema>>()
    expectTypeOf<FalsePositive>().toExtend<z.input<typeof FalsePositiveSchema>>()
    expectTypeOf<ContextDraftInput>().toExtend<z.input<typeof ContextDraftInputSchema>>()
    expectTypeOf<StatusCounts>().toExtend<z.input<typeof StatusCountsSchema>>()
    expectTypeOf<Tag>().toExtend<z.input<typeof TagSchema>>()
    expectTypeOf<Collection>().toExtend<z.input<typeof CollectionSchema>>()
    expectTypeOf<MergeImpact>().toExtend<z.input<typeof MergeImpactSchema>>()
    expectTypeOf<ConcurrentVersion>().toExtend<z.input<typeof ConcurrentVersionSchema>>()
  })

  it('valident tous les contextes des fixtures', () => {
    for (const { context } of CONTEXT_FIXTURES) {
      expect(ContextSchema.safeParse(context).success, context.slug).toBe(true)
    }
  })

  it('listent tous les motifs de refus et de violation de taxonomie', () => {
    expectTypeOf<(typeof DRAFT_REJECTIONS)[number]>().toEqualTypeOf<DraftRejection>()
    expectTypeOf<(typeof TAXONOMY_RULE_VIOLATIONS)[number]>().toEqualTypeOf<TaxonomyRuleViolation>()
  })

  it('ont un schéma d’erreur par code', () => {
    expectTypeOf<ApiError['code']>().toEqualTypeOf<ApiErrorCode>()
    const codes = ApiErrorSchema.options.map((option) => option.shape.code.value)
    expect([...codes].sort()).toEqual([...API_ERROR_CODES].sort())
  })
})
