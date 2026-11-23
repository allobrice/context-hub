import { z } from 'zod'

import { ContextSchema } from './context.ts'

export const StatusCountsSchema = z
  .object({
    published: z.number().int(),
    draft: z.number().int(),
    archived: z.number().int(),
    total: z.number().int(),
  })
  .meta({ id: 'StatusCounts' })

export const ContextPageSchema = z
  .object({
    items: z.array(ContextSchema).readonly(),
    total: z.number().int(),
    page: z.number().int(),
    pageCount: z.number().int(),
    from: z.number().int(),
    to: z.number().int(),
  })
  .meta({ id: 'ContextPage' })

export const LibrarySearchResultSchema = z
  .object({ page: ContextPageSchema, totals: StatusCountsSchema })
  .meta({ id: 'LibrarySearchResult' })
