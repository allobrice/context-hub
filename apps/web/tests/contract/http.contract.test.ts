// @vitest-environment node
/**
 * La suite de contrat, contre l'adapter HTTP branché sur un vrai serveur (processus enfant,
 * base SQLite seedée neuve par test). Mêmes scénarios que `inMemory.contract.test.ts`.
 */
import { afterAll, beforeAll } from 'vitest'

import { createHttpServices } from '../../src/infrastructure/createHttpServices.ts'
import { describeServicesContract } from '../../src/test/contract/servicesContract.ts'
import { removeTemplate, seedTemplate, startServer, type SeededTemplate } from './testServer.ts'

let template: SeededTemplate

beforeAll(async () => {
  template = await seedTemplate()
}, 30_000)

afterAll(() => {
  removeTemplate(template)
})

describeServicesContract(
  'HTTP (serveur réel)',
  async () => {
    const server = await startServer(template)
    const services = createHttpServices(
      { baseUrl: server.baseUrl, headers: { Authorization: `Bearer ${template.token}` } },
      { mcpUrl: null },
    )
    return { services, dispose: server.stop }
  },
  { timeout: 20_000 },
)
