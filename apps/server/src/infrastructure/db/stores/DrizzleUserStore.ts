import { eq } from 'drizzle-orm'

import type { NewApiToken, UserStore } from '../../../application/ports/UserStore.ts'
import { toUserId, type User } from '../../../application/viewer.ts'
import type { AppDatabase } from '../connection.ts'
import { deferred } from '../deferred.ts'
import { isoDate } from '../dates.ts'
import { apiTokens, users } from '../schema.ts'

export class DrizzleUserStore implements UserStore {
  constructor(private readonly db: AppDatabase) {}

  authenticate(tokenHash: string, at: Date): Promise<User | null> {
    return deferred(() =>
      this.db.transaction((tx) => {
        const row = tx
          .select({ id: users.id, name: users.name })
          .from(apiTokens)
          .innerJoin(users, eq(users.id, apiTokens.userId))
          .where(eq(apiTokens.tokenHash, tokenHash))
          .get()
        if (!row) return null
        tx.update(apiTokens)
          .set({ lastUsedAt: isoDate(at) })
          .where(eq(apiTokens.tokenHash, tokenHash))
          .run()
        return { id: toUserId(row.id), name: row.name }
      }),
    )
  }

  createToken({ userId, tokenHash, label, at }: NewApiToken): Promise<void> {
    return deferred(() => {
      this.db
        .insert(apiTokens)
        .values({ tokenHash, userId, label, createdAt: isoDate(at), lastUsedAt: null })
        .run()
    })
  }
}
