import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { createInMemoryServices } from './infrastructure/createInMemoryServices.ts'
import { parseMockMode } from './infrastructure/in-memory/mockMode.ts'
import { App } from './ui/app/App.tsx'
import { createQueryClient } from './ui/app/providers/createQueryClient.ts'
import './ui/styles/index.ts'

/**
 * Point d'assemblage : seul fichier autorisé à importer à la fois `infrastructure` et `ui`
 * (règle eslint boundaries). Remplacer `createInMemoryServices` par l'adapter HTTP le jour où l'API existe.
 */
const services = createInMemoryServices({
  // Relu à chaque appel : `?mock=empty|loading|error|slow|conflict` reproduit les états des maquettes.
  mode: () => parseMockMode(window.location.search),
})

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable dans index.html')

createRoot(container).render(
  <StrictMode>
    <App services={services} queryClient={createQueryClient()} />
  </StrictMode>,
)
