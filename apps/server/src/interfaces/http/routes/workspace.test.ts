import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { WorkspaceOverviewSchema } from '@context-hub/domain/schemas/workspace.ts'

import { CAMILLE_TOKEN, createTestApp, type TestApp } from '../../../test/testApp.ts'

let api: TestApp

beforeEach(async () => {
  api = await createTestApp()
})

afterEach(() => api.close())

describe('GET /api/workspace', () => {
  it('renvoie la navigation de l’utilisateur authentifié (portées des fixtures)', async () => {
    const overview = WorkspaceOverviewSchema.parse(
      await (await api.request('/api/workspace')).json(),
    )
    expect(overview).toMatchObject({
      workspaceName: 'Espace AlloVoisins',
      currentUser: { name: 'Brice' },
      contextCount: 42,
      scopeCounts: { personal: 5, project: 12, team: 25 },
      mcpServer: { status: 'online', transport: 'HTTP' },
    })
    expect(overview.tagNames).toHaveLength(34)
  })

  it('ne compte pas les contextes personnels des autres', async () => {
    const response = await api.request('/api/workspace', { token: CAMILLE_TOKEN })
    const overview = WorkspaceOverviewSchema.parse(await response.json())
    expect(overview).toMatchObject({ currentUser: { name: 'Camille' }, contextCount: 37 })
    expect(overview.scopeCounts.personal).toBe(0)
  })

  it('exige un jeton (401)', async () => {
    expect((await api.request('/api/workspace', { token: null })).status).toBe(401)
  })
})
