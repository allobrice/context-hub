import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateApiToken, hashApiToken } from '../../../application/auth/apiToken.ts'
import { toUserId } from '../../../application/viewer.ts'
import { createTestDatabase, TEST_TOKEN, type TestDatabase } from '../../../test/testDatabase.ts'
import { apiTokens } from '../schema.ts'

const AT = new Date('2026-11-23T10:30:00Z')

let database: TestDatabase

beforeEach(() => {
  database = createTestDatabase()
})

afterEach(() => {
  database.close()
})

describe('DrizzleUserStore', () => {
  it('authentifie le porteur d’un jeton par son hash et note le dernier usage', async () => {
    const user = await database.users.authenticate(hashApiToken(TEST_TOKEN), AT)
    expect(user).toEqual({ id: 'brice', name: 'Brice' })
    const row = database.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashApiToken(TEST_TOKEN)))
      .get()
    expect(row?.lastUsedAt).toBe(AT.toISOString())
  })

  it('refuse un jeton inconnu', async () => {
    expect(await database.users.authenticate(hashApiToken('chub_inconnu'), AT)).toBeNull()
  })

  it('ne stocke jamais le jeton en clair', async () => {
    const token = generateApiToken()
    await database.users.createToken({
      userId: toUserId('camille'),
      tokenHash: hashApiToken(token),
      label: 'Poste de Camille',
      at: AT,
    })
    const stored = database.db.select().from(apiTokens).all()
    expect(stored.some((row) => row.tokenHash.includes(token))).toBe(false)
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(await database.users.authenticate(hashApiToken(token), AT)).toMatchObject({
      id: 'camille',
    })
  })
})
