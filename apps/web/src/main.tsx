import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type { AppServices } from './application/services.ts'
import { readApiBaseUrl, readAppConfig } from './infrastructure/config/env.ts'
import { createHttpServices } from './infrastructure/createHttpServices.ts'
import { App } from './ui/app/App.tsx'
import { createQueryClient } from './ui/app/providers/createQueryClient.ts'
import './ui/styles/index.ts'

/**
 * Point d'assemblage : seul fichier autorisé à importer à la fois `infrastructure` et `ui`
 * (règle eslint boundaries). `VITE_DATA_SOURCE=http` branche l'API, sinon l'in-memory (défaut).
 * La comparaison reste écrite ici, sur `import.meta.env` que Vite remplace par une constante : la
 * branche inutilisée sort du bundle. L'in-memory est chargé par `import()` : un import statique
 * évaluerait `InMemoryStore` (fixtures de démo) même en mode http.
 */
async function createServices(): Promise<AppServices> {
  const config = readAppConfig()
  if (import.meta.env.VITE_DATA_SOURCE === 'http') {
    return createHttpServices({ baseUrl: readApiBaseUrl() }, config)
  }
  const [{ createInMemoryServices }, { parseMockMode }] = await Promise.all([
    import('./infrastructure/createInMemoryServices.ts'),
    import('./infrastructure/in-memory/mockMode.ts'),
  ])
  return createInMemoryServices(
    // Relu à chaque appel : `?mock=empty|loading|error|slow|conflict` reproduit les états des maquettes.
    { mode: () => parseMockMode(window.location.search) },
    config,
  )
}

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable dans index.html')

const services = await createServices()

createRoot(container).render(
  <StrictMode>
    <App services={services} queryClient={createQueryClient()} />
  </StrictMode>,
)
