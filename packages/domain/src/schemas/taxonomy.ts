import { z } from 'zod'

export const TagSchema = z
  .object({
    name: z.string(),
    contextCount: z.number().int(),
    publishedCount: z.number().int(),
    lastUsedAt: z.string().nullable(),
  })
  .meta({ id: 'Tag' })

export const CollectionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    contextCount: z.number().int(),
    publishedCount: z.number().int(),
    system: z.literal(true).optional(),
  })
  .meta({ id: 'Collection' })

export const CollectionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(240),
  })
  .meta({ id: 'CollectionInput' })

export const MergeImpactSchema = z
  .object({
    affectedContexts: z.number().int(),
    affectedPublished: z.number().int(),
    duplicatesAvoided: z.number().int(),
  })
  .meta({ id: 'MergeImpact' })

export const TagMergeSchema = z
  .object({ sources: z.array(z.string().min(1)).min(1).max(50), target: z.string().min(1) })
  .meta({ id: 'TagMerge' })

export const TagListSchema = z.array(TagSchema).readonly().meta({ id: 'TagList' })
export const CollectionListSchema = z
  .array(CollectionSchema)
  .readonly()
  .meta({ id: 'CollectionList' })
