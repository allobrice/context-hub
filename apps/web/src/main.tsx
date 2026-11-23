import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { readApiBaseUrl, readAppConfig } from './infrastructure/config/env.ts'
import { createHttpServices } from './infrastructure/createHttpServices.ts'
import { createInMemoryServices } from './infrastructure/createInMemoryServices.ts'
import { parseMockMode } from './infrastructure/in-memory/mockMode.ts'
import { App } from './ui/app/App.tsx'
import { createQueryClient } from './ui/app/providers/createQueryClient.ts'
import './ui/styles/index.ts'

/**
 * Point d'assemblage : seul fichier autorisé à importer à la fois `infrastructure` et `ui`
 * (règle eslint boundaries). `VITE_DATA_SOURCE=http` branche l'API, sinon l'in-memory (défaut).
 * La comparaison reste écrite ici, sur `import.meta.env` que Vite remplace par une constante : la
 * branche inutilisée et ses dépendances (fixtures ou client HTTP) sortent ainsi du bundle. Passée
 * par une fonction, elle ne serait plus évaluée au build et les deux adapters seraient embarqués.
 */
const config = readAppConfig()
const services =
  import.meta.env.VITE_DATA_SOURCE === 'http'
    ? createHttpServices({ baseUrl: readApiBaseUrl() }, config)
    : createInMemoryServices(
        // Relu à chaque appel : `?mock=empty|loading|error|slow|conflict` reproduit les états des maquettes.
        { mode: () => parseMockMode(window.location.search) },
        config,
      )

const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable dans index.html')

createRoot(container).render(
  <StrictMode>
    <App services={services} queryClient={createQueryClient()} />
  </StrictMode>,
)
