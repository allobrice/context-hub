import { MemoryRouter } from 'react-router'

import { ComponentGallery } from './dev/ComponentGallery.tsx'
import { ThemeProvider } from './theme/ThemeProvider.tsx'

/** Coquille provisoire (phase 2) : galerie des composants. Remplacée par le router en phase 3. */
export function App() {
  return (
    <ThemeProvider>
      <MemoryRouter>
        <ComponentGallery />
      </MemoryRouter>
    </ThemeProvider>
  )
}
