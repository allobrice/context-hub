import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { UNCATEGORIZED_COLLECTION_ID } from '@context-hub/domain/taxonomy/types.ts'

import { hashApiToken } from '../../../application/auth/apiToken.ts'
import { BRICE, createTestDatabase, type TestDatabase } from '../../../test/testDatabase.ts'
import { seedEmptyWorkspace } from './seedDemoData.ts'

const TOKEN = 'chub_empty-workspace-test-token-only'

let database: TestDatabase

beforeEach(() => {
  database = createTestDatabase({ seed: false })
  seedEmptyWorkspace(database.db, { now: database.clock.now(), token: TOKEN })
})

afterEach(() => {
  database.close()
})

describe('seedEmptyWorkspace', () => {
  it('ne contient aucun contexte ni tag de démo', async () => {
    const { totals } = await database.contexts.search(BRICE, {
      query: '',
      tags: [],
      collectionId: null,
      scope: null,
      status: null,
      sort: 'updated-desc',
      page: 1,
    })
    expect(totals).toEqual({ total: 0, published: 0, draft: 0, archived: 0 })
    expect(await database.taxonomy.listTags(BRICE)).toEqual([])
  })

  it('crée la seule collection système et un jeton utilisable', async () => {
    expect(await database.taxonomy.listCollections(BRICE)).toEqual([
      expect.objectContaining({ id: UNCATEGORIZED_COLLECTION_ID, system: true, contextCount: 0 }),
    ])
    expect(await database.users.authenticate(hashApiToken(TOKEN), new Date())).toMatchObject({
      id: 'brice',
    })
  })
})
