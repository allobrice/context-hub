/** Schéma Zod de l'identité de session, partagé par les contrats Workspaces et Missions. */
import { z } from 'zod'

export const SessionRefSchema = z
  .object({
    userId: z.string(),
    userName: z.string(),
    sessionLabel: z.string(),
    repo: z.string().nullable(),
  })
  .meta({ id: 'SessionRef' })
