import { eq } from 'drizzle-orm'

import { generateApiToken, hashApiToken } from '../../../application/auth/apiToken.ts'
import type { SyncDb } from '../connection.ts'
import { isoDate } from '../dates.ts'
import { apiTokens, users } from '../schema.ts'

export interface IssueApiTokenOptions {
  readonly userId: string
  readonly label: string
  readonly now: Date
  /** Jeton imposé (tests) ; sinon un jeton aléatoire est généré. */
  readonly token?: string
}

/**
 * Émet un nouveau jeton d'API pour un utilisateur existant, sans toucher aux jetons déjà émis.
 * Seul le hash est stocké : le jeton renvoyé n'est affiché qu'une fois. `null` si l'utilisateur
 * n'existe pas.
 */
export function issueApiToken(
  db: SyncDb,
  { userId, label, now, token }: IssueApiTokenOptions,
): { token: string } | null {
  const user = db.select({ id: users.id }).from(users).where(eq(users.id, userId)).get()
  if (user === undefined) return null
  const issued = token ?? generateApiToken()
  db.insert(apiTokens)
    .values({
      tokenHash: hashApiToken(issued),
      userId,
      label,
      createdAt: isoDate(now),
      lastUsedAt: null,
    })
    .run()
  return { token: issued }
}
