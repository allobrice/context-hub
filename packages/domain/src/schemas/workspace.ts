import { z } from 'zod'

import { CollectionSchema } from './taxonomy.ts'

/** Données de navigation (sidebar). */
export const WorkspaceOverviewSchema = z
  .object({
    workspaceName: z.string(),
    currentUser: z.object({ name: z.string() }),
    contextCount: z.number().int(),
    collections: z.array(CollectionSchema).readonly(),
    scopeCounts: z.object({
      personal: z.number().int(),
      project: z.number().int(),
      team: z.number().int(),
    }),
    tagNames: z.array(z.string()).readonly(),
    mcpServer: z.object({ status: z.enum(['online', 'offline']), transport: z.string() }),
  })
  .meta({ id: 'WorkspaceOverview' })
