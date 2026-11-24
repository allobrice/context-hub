import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { hashApiToken } from '../../../application/auth/apiToken.ts'
import { createTestDatabase, TEST_TOKEN, type TestDatabase } from '../../../test/testDatabase.ts'
import { issueApiToken } from './issueApiToken.ts'

let database: TestDatabase

beforeEach(() => {
  database = createTestDatabase()
})

afterEach(() => {
  database.close()
})

describe('issueApiToken', () => {
  it('émet un jeton utilisable sans révoquer les jetons existants', async () => {
    const issued = issueApiToken(database.db, {
      userId: 'brice',
      label: 'Réémis',
      now: database.clock.now(),
    })
    expect(issued?.token).toMatch(/^chub_[A-Za-z0-9_-]{43}$/)
    const at = database.clock.now()
    expect(await database.users.authenticate(hashApiToken(issued?.token ?? ''), at)).toMatchObject({
      id: 'brice',
    })
    expect(await database.users.authenticate(hashApiToken(TEST_TOKEN), at)).toMatchObject({
      id: 'brice',
    })
  })

  it('refuse un utilisateur inconnu', () => {
    expect(
      issueApiToken(database.db, { userId: 'inconnu', label: 'x', now: database.clock.now() }),
    ).toBeNull()
  })
})
