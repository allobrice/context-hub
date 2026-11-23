import { createTestServices } from '../renderApp.tsx'
import { describeServicesContract } from './servicesContract.ts'

describeServicesContract('in-memory', () =>
  Promise.resolve({ services: createTestServices(), dispose: () => Promise.resolve() }),
)
