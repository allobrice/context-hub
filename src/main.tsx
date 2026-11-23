import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './ui/app/App.tsx'

/**
 * Point d'assemblage : seul fichier autorisé à importer à la fois `infrastructure` et `ui`
 * (règle eslint boundaries). Les repositories y seront instanciés et injectés en phase 3.
 */
const container = document.getElementById('root')
if (!container) throw new Error('Élément #root introuvable dans index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
