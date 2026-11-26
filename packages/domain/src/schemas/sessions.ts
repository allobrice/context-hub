/** Schéma Zod de l'identité de session, partagé par les contrats Workspaces et Missions. */
import { z } from 'zod'

import { SESSION_LABEL_PATTERN } from '../sessions/session.ts'
import { REPO_PATTERN } from '../shared/repo.ts'

export const SessionRefSchema = z
  .object({
    userId: z.string(),
    userName: z.string(),
    sessionLabel: z.string(),
    repo: z.string().nullable(),
  })
  .meta({ id: 'SessionRef' })

export const SessionLabelSchema = z
  .string()
  .regex(SESSION_LABEL_PATTERN)
  .meta({ description: 'Label de la session Claude Code, ex. « web-1 » (unique par utilisateur).' })

export const RepoSchema = z
  .string()
  .max(200)
  .regex(REPO_PATTERN)
  .meta({ description: '`owner/name`, ex. « allovoisins/front ».' })

export const SessionInputSchema = z
  .object({
    session: SessionLabelSchema,
    repo: RepoSchema.nullable().default(null),
  })
  .meta({ id: 'SessionInput' })
