/**
 * Le contrat commité (`apps/server/openapi.json`) est la source des types générés du front : il doit
 * toujours refléter les routes. En cas d'échec : `pnpm --filter @context-hub/server openapi:export`.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createTestApp } from '../../test/testApp.ts'

const COMMITTED = fileURLToPath(new URL('../../../openapi.json', import.meta.url))

describe('openapi.json', () => {
  it('est à jour avec les routes', async () => {
    const api = await createTestApp()
    try {
      const served: unknown = await (await api.request('/api/openapi.json')).json()
      const committed: unknown = JSON.parse(readFileSync(COMMITTED, 'utf8'))
      expect(committed).toEqual(served)
    } finally {
      await api.close()
    }
  })
})
